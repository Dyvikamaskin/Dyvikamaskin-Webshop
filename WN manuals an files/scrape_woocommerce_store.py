"""
Generic WooCommerce Store API scraper.

Hits the public `/wp-json/wc/store/v1/products` endpoint — no auth,
returns clean JSON with prices in cents.

Usage:
  python scrape_woocommerce_store.py --host https://tiendamamsa.com \\
      --search wacker --out wn_tiendamamsa.csv

CSV columns:
  part_number, name, price, currency, vendor, product_url, image_url,
  entity_id, raw_sku, raw_name
"""
import csv
import re
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


def fetch_page(host, search, page, per_page, retries=3):
    url = (f"{host}/wp-json/wc/store/v1/products"
           f"?per_page={per_page}&page={page}&search={search}")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            print(f"  ! page {page} attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"page {page} failed: {last_err}")


def price_from_woo(item):
    """WooCommerce Store API returns 'prices' with cents amounts.
    e.g. {"price": "1995", "currency_code": "EUR", "currency_minor_unit": 2}
    → 19.95 EUR"""
    prices = item.get("prices") or {}
    raw = prices.get("price") or "0"
    minor = prices.get("currency_minor_unit") or 2
    try:
        return f"{int(raw) / (10 ** minor):.2f}"
    except (ValueError, TypeError):
        return ""


def flatten(item):
    return {
        "part_number": (item.get("sku") or "").strip(),
        "name": item.get("name") or "",
        "price": price_from_woo(item),
        "currency": ((item.get("prices") or {}).get("currency_code") or "").upper(),
        "vendor": ", ".join(b.get("name", "") for b in (item.get("brands") or [])),
        "product_url": item.get("permalink"),
        "image_url": ((item.get("images") or [{}])[0]).get("src"),
        "entity_id": str(item.get("id") or ""),
        "raw_sku": item.get("sku") or "",
        "raw_name": item.get("name") or "",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--search", default="wacker")
    ap.add_argument("--out", required=True)
    ap.add_argument("--per-page", type=int, default=100,
                    help="WooCommerce Store API caps at 100/page")
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--limit-pages", type=int, default=None)
    args = ap.parse_args()

    host = args.host.rstrip("/")
    rows = []
    page = 1
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        items = fetch_page(host, args.search, page, args.per_page)
        if not items:
            print(f"Page {page} empty — done.")
            break
        page_rows = [flatten(it) for it in items]
        # Only keep rows where Wacker is mentioned (search may return loose matches)
        kept = [r for r in page_rows
                if "wacker" in (r["name"] + " " + r["vendor"]).lower()]
        rows.extend(kept)
        print(f"  page {page:3d}: {len(items):3d} items → {len(kept):3d} kept "
              f"(cumulative {len(rows)})", flush=True)
        if len(items) < args.per_page:
            break
        page += 1
        time.sleep(args.delay)

    seen = set()
    deduped = []
    for r in rows:
        key = r["entity_id"] or (r["part_number"], r["product_url"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    cols = ["part_number", "name", "price", "currency", "vendor",
            "product_url", "image_url", "entity_id", "raw_sku", "raw_name"]
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(deduped)
    print(f"\nWrote {args.out}  ({len(deduped)} rows)")
    for k in ("part_number", "name", "price"):
        missing = sum(1 for r in deduped if not r[k])
        print(f"  missing {k:13s} {missing}")


if __name__ == "__main__":
    main()
