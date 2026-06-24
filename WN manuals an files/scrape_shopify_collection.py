"""
Generic Shopify collection scraper. Walks `/collections/<handle>/products.json`
and writes a CSV with the same column shape as scrape_hydrotech_wn.py /
scrape_dhs_wn.py.

Usage:
  python scrape_shopify_collection.py --host https://russopower.com \\
      --collection wacker-neuson --out wn_russopower.csv \\
      --strip-prefix "Wacker Neuson"

  python scrape_shopify_collection.py --host https://www.contractorsdirect.com \\
      --collection wacker-neuson --out wn_contractorsdirect.csv

Output columns:
  part_number, alt_skus, name, price, currency, available,
  compare_at_price, vendor, product_url, image_url,
  handle, product_id, variant_id, variant_title, raw_title
"""
import re
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

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())
PAGE_LIMIT = 250


class PaginationCap(Exception):
    """Shopify returns HTTP 400 when you page past its hard cap (~page 100)."""


def fetch_page(host, collection, page, retries=3):
    if collection:
        url = f"{host}/collections/{collection}/products.json?page={page}&limit={PAGE_LIMIT}"
    else:
        url = f"{host}/products.json?page={page}&limit={PAGE_LIMIT}"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
                return json.loads(resp.read().decode("utf-8")).get("products") or []
        except urllib.error.HTTPError as e:
            if e.code == 400:
                raise PaginationCap(f"page {page}: HTTP 400 (pagination cap)")
            last_err = e
            wait = 2 ** attempt
            print(f"  ! page {page} attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            print(f"  ! page {page} attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"page {page} failed after {retries}: {last_err}")


PARTNO_RE = re.compile(r"\s*part\s*no\.?\s*[A-Z0-9./\-]+\s*$", re.IGNORECASE)


def derive_name(title, sku, strip_prefix):
    s = title or ""
    if strip_prefix:
        pre_re = re.compile(rf"^\s*{re.escape(strip_prefix)}\s*[:\-]?\s*", re.IGNORECASE)
        s = pre_re.sub("", s)
    s = PARTNO_RE.sub("", s)
    if sku:
        # Remove a bare SKU appearing anywhere in the title (start, middle, or end).
        s = re.sub(rf"\b{re.escape(sku)}\b", "", s)
        # Tidy up double-spaces / trailing punctuation left behind.
        s = re.sub(r"\s{2,}", " ", s).strip(" -:|")
    return s.strip()


def flatten(product, host, strip_prefix):
    rows = []
    handle = product.get("handle") or ""
    product_url = f"{host}/products/{handle}" if handle else None
    images = product.get("images") or []
    image_url = images[0].get("src") if images else None
    title = product.get("title") or ""
    vendor = product.get("vendor") or ""
    pid = product.get("id")

    for v in product.get("variants") or []:
        raw_sku = (v.get("sku") or "").strip()
        # Some stores embed option names in the SKU like "1821-1 in. head-13".
        # The leading segment up to the first ' ' / '-' run is usually the OEM #.
        primary = raw_sku.split("-")[0].strip() if raw_sku else ""
        alts = "-".join(raw_sku.split("-")[1:]).strip() if "-" in raw_sku else ""
        rows.append({
            "part_number": primary,
            "alt_skus": alts,
            "name": derive_name(title, primary, strip_prefix),
            "price": v.get("price"),
            "currency": "USD",
            "available": v.get("available"),
            "compare_at_price": v.get("compare_at_price"),
            "vendor": vendor,
            "product_url": product_url,
            "image_url": image_url,
            "handle": handle,
            "product_id": pid,
            "variant_id": v.get("id"),
            "variant_title": v.get("title"),
            "raw_title": title,
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True,
                    help="e.g. https://russopower.com (no trailing slash)")
    ap.add_argument("--collection", default=None,
                    help="collection handle, e.g. wacker-neuson; omit with "
                         "--all-products to walk the whole store")
    ap.add_argument("--all-products", action="store_true",
                    help="hit /products.json (whole store) instead of a "
                         "collection; usually paired with --vendor-filter")
    ap.add_argument("--vendor-filter", default=None,
                    help='only keep products whose vendor matches, '
                         'e.g. "Wacker Neuson"')
    ap.add_argument("--out", required=True)
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--strip-prefix", default=None,
                    help='prefix to strip from titles, e.g. "Wacker Neuson"')
    ap.add_argument("--delay", type=float, default=0.5)
    ap.add_argument("--limit-pages", type=int, default=None)
    args = ap.parse_args()

    if not args.collection and not args.all_products:
        ap.error("either --collection or --all-products is required")

    host = args.host.rstrip("/")
    collection = None if args.all_products else args.collection
    rows = []
    page = 1
    vendor_lc = args.vendor_filter.strip().lower() if args.vendor_filter else None
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        try:
            prods = fetch_page(host, collection, page)
        except PaginationCap as e:
            print(f"{e} — saving what we have ({len(rows)} rows).")
            break
        if not prods:
            print(f"Page {page} empty — done.")
            break
        if vendor_lc:
            kept = [p for p in prods if (p.get("vendor") or "").strip().lower() == vendor_lc]
        else:
            kept = prods
        page_rows = []
        for p in kept:
            page_rows.extend(flatten(p, host, args.strip_prefix))
        rows.extend(page_rows)
        suffix = (f" (filtered: {len(kept)}/{len(prods)} matched vendor)"
                  if vendor_lc else "")
        print(f"  page {page:3d}: {len(prods):3d} products → {len(page_rows):3d} rows "
              f"(cumulative {len(rows)}){suffix}", flush=True)
        page += 1
        time.sleep(args.delay)

    seen = set()
    deduped = []
    for r in rows:
        key = (r["part_number"], r["variant_id"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    cols = [
        "part_number", "alt_skus", "name", "price", "currency", "available",
        "compare_at_price", "vendor", "product_url", "image_url",
        "handle", "product_id", "variant_id", "variant_title", "raw_title",
    ]
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(deduped)
    print(f"\nWrote {args.out}  ({len(deduped)} rows)")
    for k in ("part_number", "name", "price"):
        missing = sum(1 for r in deduped if not r[k])
        print(f"  missing {k:13s} {missing}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(deduped, f, indent=2, ensure_ascii=False)
        print(f"  also wrote {args.json_out}")


if __name__ == "__main__":
    main()
