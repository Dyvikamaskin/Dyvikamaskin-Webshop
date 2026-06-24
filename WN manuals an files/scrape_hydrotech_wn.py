"""
Scrape every Wacker Neuson spare-part listed on hydrotechnologysystems.us.

The store is Shopify; the public `/products.json` endpoint exposes the
whole collection paginated. No auth, no JS rendering needed.

Usage:
  python scrape_hydrotech_wn.py [--out wn_hydrotech.csv]
                                [--json wn_hydrotech.json]
                                [--delay 0.5] [--limit-pages N]

Output (CSV columns):
  part_number, title, name, price, currency, available,
  compare_at_price, vendor, product_url, image_url, handle, product_id

`name` is derived from `title` by stripping the "Wacker Neuson :" prefix
and the trailing "Part No. <sku>" suffix. The raw `title` is kept too.
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

BASE = "https://hydrotechnologysystems.us"
COLLECTION = "wacker-neuson-spare-parts"
ENDPOINT = BASE + "/collections/" + COLLECTION + "/products.json"
PAGE_LIMIT = 250  # Shopify max

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

CTX = ssl.create_default_context(cafile=certifi.where())

PREFIX_RE = re.compile(r"^\s*wacker\s*neuson\s*[:\-]\s*", re.IGNORECASE)
PARTNO_RE = re.compile(r"\s*part\s*no\.?\s*[A-Z0-9./\-]+\s*$", re.IGNORECASE)


class PaginationCap(Exception):
    """Raised when Shopify returns HTTP 400 — its hard cap is ~page 100."""


def fetch_page(page, retries=3):
    url = f"{ENDPOINT}?page={page}&limit={PAGE_LIMIT}"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
                return json.loads(resp.read().decode("utf-8")).get("products") or []
        except urllib.error.HTTPError as e:
            if e.code == 400:
                # Shopify hard-caps /products.json at page 100 (or some stores
                # earlier). 400 means "past the end" — stop cleanly.
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
    raise RuntimeError(f"page {page} failed after {retries} attempts: {last_err}")


def derive_name(title, sku):
    s = title or ""
    s = PREFIX_RE.sub("", s)
    s = PARTNO_RE.sub("", s)
    # Also strip a trailing bare SKU if title ends with it after the regex.
    if sku and s.rstrip().lower().endswith(sku.lower()):
        s = s.rstrip()[: -len(sku)].rstrip(" -:")
    return s.strip()


def flatten(product):
    """One product → one or more rows (one per variant)."""
    rows = []
    handle = product.get("handle") or ""
    product_url = f"{BASE}/products/{handle}" if handle else None
    images = product.get("images") or []
    image_url = images[0].get("src") if images else None
    title = product.get("title") or ""
    vendor = product.get("vendor") or ""
    pid = product.get("id")

    for v in product.get("variants") or []:
        sku = (v.get("sku") or "").strip()
        rows.append({
            "part_number": sku,
            "title": title,
            "name": derive_name(title, sku),
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
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wn_hydrotech.csv")
    ap.add_argument("--json", dest="json_out", default=None,
                    help="optional path to also dump the raw flattened rows as JSON")
    ap.add_argument("--delay", type=float, default=0.5)
    ap.add_argument("--limit-pages", type=int, default=None,
                    help="stop after N pages (debug)")
    args = ap.parse_args()

    rows = []
    page = 1
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        try:
            prods = fetch_page(page)
        except PaginationCap as e:
            print(f"{e} — saving what we have ({len(rows)} rows).")
            break
        if not prods:
            print(f"Page {page} empty — done.")
            break
        page_rows = []
        for p in prods:
            page_rows.extend(flatten(p))
        rows.extend(page_rows)
        print(f"  page {page:3d}: {len(prods):3d} products → {len(page_rows):3d} rows "
              f"(cumulative {len(rows)})", flush=True)
        page += 1
        time.sleep(args.delay)

    # Deduplicate by (part_number, variant_id) just in case.
    seen = set()
    deduped = []
    for r in rows:
        key = (r["part_number"], r["variant_id"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    cols = [
        "part_number", "title", "name", "price", "currency", "available",
        "compare_at_price", "vendor", "product_url", "image_url",
        "handle", "product_id", "variant_id", "variant_title",
    ]
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(deduped)
    print(f"\nWrote {args.out}  ({len(deduped)} rows)")

    missing_sku = sum(1 for r in deduped if not r["part_number"])
    no_price = sum(1 for r in deduped if not r["price"])
    print(f"  rows missing part_number: {missing_sku}")
    print(f"  rows missing price:       {no_price}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(deduped, f, indent=2, ensure_ascii=False)
        print(f"  also wrote {args.json_out}")


if __name__ == "__main__":
    main()
