"""
Scrape every Wacker Neuson product on tmsequip via its ConvertCart search API.

The on-page brand listing only shows ~72 cards; the real catalog is exposed
through the storefront's ConvertCart third-party search endpoint. That JSON
endpoint is CORS-open, no-auth, returns 20 products/page, and reports a
total `aggregations.vendor[0].count` of ~66,678 for `q=neuson` filtered to
the `wacker neuson parts lookup` category.

Usage:
  python scrape_tmsequip_search.py [--out wn_tmsequip_full.csv]
                                   [--delay 0.4] [--limit-pages N]

Output CSV columns:
  part_number, name, price, original_price, currency, in_stock, vendor,
  product_url, image_url, entity_id, sold_6m, created_year, categories
"""
import csv
import ssl
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

import certifi

sys.stdout.reconfigure(encoding="utf-8")

ENDPOINT = (
    "https://dc3.convertcart.com/search/v3/search/60168071/35460870/1/"
    "364776882.2559989425?pageId=XcFt4e&templateId=4&templateName=in-page-desktop"
    "&q=neuson&categories=wacker%20neuson%20parts%20lookup&pageIndex={page}"
)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())


def fetch_page(page, retries=3):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(ENDPOINT.format(page=page), headers={
                "User-Agent": UA,
                "Accept": "*/*",
                "Origin": "https://www.tmsequip.com",
                "Referer": "https://www.tmsequip.com/",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            print(f"  ! page {page} attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"page {page} failed after {retries}: {last_err}")


def flatten(item):
    cats = item.get("categories") or []
    return {
        "part_number": (item.get("sku") or "").strip(),
        "name": item.get("name") or "",
        "price": item.get("price"),
        "original_price": item.get("originalPrice"),
        "currency": "USD",
        "in_stock": item.get("inStock"),
        "vendor": item.get("vendor"),
        "product_url": item.get("url"),
        "image_url": item.get("image"),
        "entity_id": item.get("id") or item.get("_id"),
        "sold_6m": item.get("soldCount6M"),
        "created_year": item.get("createdAt"),
        "categories": "; ".join(cats) if isinstance(cats, list) else str(cats),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wn_tmsequip_full.csv")
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--limit-pages", type=int, default=None)
    args = ap.parse_args()

    rows = []
    page = 1
    total = None
    started = time.time()
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        data = fetch_page(page)
        if total is None:
            total = data.get("totalProducts") or 0
            pages_est = (total + 19) // 20 if total else "?"
            print(f"Total products reported: {total} (~{pages_est} pages)")
        res = data.get("res") or []
        if not res:
            print(f"Page {page} empty — done.")
            break
        rows.extend(flatten(r) for r in res)
        if page % 25 == 0 or page == 1:
            elapsed = time.time() - started
            print(f"  page {page:4d}: +{len(res):3d} (cumulative {len(rows)}; "
                  f"{elapsed/60:.1f} min elapsed)", flush=True)
        page += 1
        time.sleep(args.delay)

    # Dedupe by entity_id (defensive — pagination ought to be clean)
    seen = set()
    deduped = []
    for r in rows:
        key = r["entity_id"] or (r["part_number"], r["product_url"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    cols = [
        "part_number", "name", "price", "original_price", "currency",
        "in_stock", "vendor", "product_url", "image_url",
        "entity_id", "sold_6m", "created_year", "categories",
    ]
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(deduped)

    elapsed = time.time() - started
    print()
    print(f"Wrote {args.out}  ({len(deduped)} rows, total reported {total})")
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
