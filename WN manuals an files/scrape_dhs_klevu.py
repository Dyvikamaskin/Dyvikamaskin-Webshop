"""
Scrape every Wacker Neuson product on DHS Equipment via its Klevu search API.

The on-site brand listing only shows the first 600 SKUs. The real catalog
is exposed via Klevu's storefront search endpoint, which reports ~146,142
matches for `term="wacker"` and is paginatable via offset.

Endpoint:  POST https://uscs33v2.ksearchnet.com/cs/v2/search
Auth:      none — public API, key in header `x-klevu-api-key`.

Usage:
  python scrape_dhs_klevu.py [--out wn_dhs_klevu.csv]
                             [--delay 0.4] [--limit-per-page 200]
                             [--limit-pages N]

CSV columns:
  part_number, alt_skus, name, price, sale_price, base_price, currency,
  in_stock, vendor, product_url, image_url, entity_id, raw_sku, raw_name,
  short_desc, klevu_category
"""
import csv
import re
import ssl
import sys
import json
import html
import time
import argparse
import urllib.request
import urllib.error

import certifi

sys.stdout.reconfigure(encoding="utf-8")

ENDPOINT = "https://uscs33v2.ksearchnet.com/cs/v2/search"
API_KEY = "klevu-171815877897717375"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())

BRAND_SUFFIX_RE = re.compile(r"[\s\-|]+wacker\s*neuson\s*$", re.I)
PART_HASH_RE = re.compile(r"Part\s*#\s*([A-Za-z0-9./\-]+)", re.I)


def clean_sku(raw):
    """DHS Klevu SKUs come as e.g. '5100033182-Wacker Neuson'. Strip brand."""
    if not raw:
        return "", []
    cleaned = BRAND_SUFFIX_RE.sub("", raw).strip()
    segs = [s.strip() for s in cleaned.split("|") if s.strip()]
    segs = [s for s in segs if s.lower() not in ("wacker neuson", "wacker")]
    if not segs:
        return "", []
    return segs[0], segs[1:]


def derive_name(raw_name, sku):
    """Names like 'Wacker Neuson 5100033182 Sight Glass' → strip prefix + sku."""
    s = html.unescape(raw_name or "").strip()
    # Remove leading "Wacker Neuson " (case-insensitive) and any embedded SKU.
    s = re.sub(r"^\s*wacker\s*neuson\s+", "", s, flags=re.I)
    if sku:
        s = re.sub(rf"\b{re.escape(sku)}\b", "", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" -:|")
    return s


def fetch_page(term, limit, offset, retries=3):
    body = {
        "context": {"apiKeys": [API_KEY]},
        "recordQueries": [{
            "id": "productList",
            "typeOfRequest": "SEARCH",
            "settings": {
                "query": {"term": term},
                "typeOfRecords": ["KLEVU_PRODUCT"],
                "limit": limit,
                "offset": offset,
                "priceFieldSuffix": "USD",
            },
        }],
    }
    payload = json.dumps(body).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(ENDPOINT, method="POST", data=payload, headers={
                "User-Agent": UA,
                "Content-Type": "application/json; charset=UTF-8",
                "x-klevu-api-key": API_KEY,
                "x-klevu-integration-type": "jsv2",
                "x-klevu-integration-version": "2.13.3",
                "Origin": "https://stores.dhsequipmentparts.com",
                "Referer": "https://stores.dhsequipmentparts.com/",
                "Accept": "*/*",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            print(f"  ! offset={offset} attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"offset {offset} failed after {retries}: {last_err}")


def flatten(item, only_brand=None):
    brand = (item.get("brand") or "").strip()
    if only_brand and brand.lower() != only_brand.lower():
        return None
    raw_sku = (item.get("sku") or "").strip()
    sku, alt = clean_sku(raw_sku)
    raw_name = item.get("name") or ""
    cats = item.get("category") or ""
    if isinstance(cats, list):
        cats = "; ".join(cats)
    klev_cat = item.get("klevu_category") or ""
    if isinstance(klev_cat, list):
        klev_cat = "; ".join(klev_cat)
    return {
        "part_number": sku,
        "alt_skus": ";".join(alt),
        "name": derive_name(raw_name, sku),
        "price": item.get("price"),
        "sale_price": item.get("salePrice"),
        "base_price": item.get("basePrice"),
        "currency": item.get("currency") or "USD",
        "in_stock": item.get("inStock"),
        "vendor": brand,
        "product_url": item.get("url"),
        "image_url": item.get("image") or item.get("imageUrl"),
        "entity_id": item.get("id") or item.get("itemGroupId"),
        "raw_sku": raw_sku,
        "raw_name": raw_name,
        "short_desc": (item.get("shortDesc") or "")[:500],
        "klevu_category": klev_cat[:1000],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wn_dhs_klevu.csv")
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--term", default="wacker")
    ap.add_argument("--only-brand", default="Wacker Neuson",
                    help='client-side brand filter; "" to disable')
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--limit-per-page", type=int, default=200)
    ap.add_argument("--limit-pages", type=int, default=None)
    args = ap.parse_args()

    only_brand = args.only_brand or None

    rows = []
    offset = 0
    page = 1
    total = None
    started = time.time()
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        data = fetch_page(args.term, args.limit_per_page, offset)
        q = (data.get("queryResults") or [{}])[0]
        meta = q.get("meta") or {}
        recs = q.get("records") or []
        if total is None:
            total = meta.get("totalResultsFound") or 0
            pages_est = (total + args.limit_per_page - 1) // args.limit_per_page if total else "?"
            print(f"Total products reported: {total} (~{pages_est} pages at limit={args.limit_per_page})")
        if not recs:
            print(f"Offset {offset} returned 0 records — done.")
            break
        page_rows = []
        for r in recs:
            row = flatten(r, only_brand=only_brand)
            if row:
                page_rows.append(row)
        rows.extend(page_rows)
        if page % 25 == 0 or page == 1:
            elapsed = time.time() - started
            print(f"  page {page:4d} (offset {offset:>6}): +{len(recs):3d} → kept {len(page_rows):3d} "
                  f"(cumulative {len(rows)}; {elapsed/60:.1f} min)", flush=True)
        # Advance offset by actual records returned. Klevu silently caps
        # response size below the requested limit; advancing by limit would
        # skip records in the gap.
        offset += len(recs)
        page += 1
        time.sleep(args.delay)

    # Dedupe by entity_id
    seen = set()
    deduped = []
    for r in rows:
        key = r["entity_id"] or (r["part_number"], r["product_url"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    cols = [
        "part_number", "alt_skus", "name", "price", "sale_price", "base_price",
        "currency", "in_stock", "vendor", "product_url", "image_url",
        "entity_id", "raw_sku", "raw_name", "short_desc", "klevu_category",
    ]
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(deduped)

    elapsed = time.time() - started
    print()
    print(f"Wrote {args.out}  ({len(deduped)} rows; total reported {total}; "
          f"dropped by brand filter: {len(rows) - len(deduped) if not only_brand else 'see counter above'})")
    for k in ("part_number", "name", "price"):
        missing = sum(1 for r in deduped if r.get(k) in (None, "", 0))
        print(f"  missing {k:13s} {missing}")
    print(f"  elapsed: {elapsed/60:.1f} min")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(deduped, f, indent=2, ensure_ascii=False)
        print(f"  also wrote {args.json_out}")


if __name__ == "__main__":
    main()
