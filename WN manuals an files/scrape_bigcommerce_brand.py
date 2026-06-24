"""
Generic BigCommerce brand/category listing scraper. Walks `<listing-url>?page=N`
and parses the inline `data-*` attributes on each product card. Same output
shape as scrape_dhs_wn.py.

Usage:
  python scrape_bigcommerce_brand.py \\
      --listing-url "https://www.tmsequip.com/categories/parts/wacker-neuson-parts-lookup.html" \\
      --brand-filter "Wacker Neuson" \\
      --out wn_tmsequip.csv

Some stores (e.g. tmsequip) mix cross-brand upsell into the same grid;
--brand-filter drops cards whose data-product-brand doesn't match.
Some stores also have no data-sku attribute — in that case the SKU is
parsed out of `data-name` (e.g. "Wacker Neuson Part # 5000169409 | ...").

Output columns:
  part_number, alt_skus, name, price, currency, vendor,
  product_url, image_url, entity_id, raw_sku, raw_name
"""
import re
import csv
import ssl
import sys
import json
import html
import time
import argparse
import urllib.request
import urllib.error
from urllib.parse import urlparse

import certifi

sys.stdout.reconfigure(encoding="utf-8")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())

CARD_RE = re.compile(r"<article\b[^>]*class=\"[^\"]*card\b[^\"]*\"[^>]*>", re.I)
ATTR_RE = re.compile(r'(\w[\w\-]*)\s*=\s*"([^"]*)"')
IMG_RE = re.compile(r'<img[^>]+class="card-image"[^>]*>', re.I)
PAGE_OF_RE = re.compile(r"Page\s+\d+\s+of\s+(\d+)", re.I)
BRAND_SUFFIX_RE = re.compile(r"[\s\-|]+wacker\s*neuson\s*$", re.I)
PART_HASH_RE = re.compile(r"Part\s*#\s*([A-Za-z0-9./\-]+)", re.I)


def fetch(url, retries=3):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            print(f"  ! {url} attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"{url} failed after {retries}: {last_err}")


def clean_mojibake(s):
    if not s:
        return s
    return s.replace("?�", '"').replace("�", '"')


def split_pipes(raw):
    return [seg.strip() for seg in (raw or "").split("|") if seg.strip()]


def parse_sku(raw):
    cleaned = BRAND_SUFFIX_RE.sub("", raw or "").strip()
    segs = split_pipes(cleaned)
    segs = [s for s in segs if s.lower() not in ("wacker neuson", "wacker")]
    if not segs:
        return "", []
    return segs[0], segs[1:]


def parse_sku_from_name(name):
    """For stores that embed the SKU in data-name like
    'Wacker Neuson Part # 5000169409 | HOSE, 200PSI, ...'.
    Returns (sku, description) where description is the bit after the SKU."""
    m = PART_HASH_RE.search(name or "")
    if not m:
        return "", name
    sku = m.group(1).strip()
    # Strip everything up to and including the Part # SKU token, then any
    # leading separators on the remainder.
    remainder = name[m.end():].lstrip(" |-:").strip()
    return sku, remainder


def parse_name(raw):
    name = clean_mojibake(html.unescape(raw or "")).strip()
    segs = split_pipes(name)
    return segs[0] if segs else name


def parse_cards(page_html, host, brand_filter=None):
    """Yield row dicts from a brand-page HTML."""
    href_figure_re = re.compile(
        r'<a[^>]+class="card-figure__link"[^>]+href="([^"]+)"', re.I)
    href_fallback_re = re.compile(
        rf'href="({re.escape(host)}/[a-z0-9][a-z0-9\-/]+(?:\.html)?/?)"', re.I)
    rows = []
    skipped_brand = 0
    for m in CARD_RE.finditer(page_html):
        attrs = dict(ATTR_RE.findall(m.group(0)))
        if brand_filter and (attrs.get("data-product-brand") or "").strip().lower() != brand_filter.strip().lower():
            skipped_brand += 1
            continue
        start = m.start()
        end = page_html.find("</article>", start)
        block = (page_html[start: end + len("</article>")] if end != -1
                 else page_html[start: start + 6000])

        raw_sku = attrs.get("data-sku", "")
        raw_name = html.unescape(attrs.get("data-name", ""))
        sku, alt_skus = parse_sku(raw_sku)
        if not sku:
            # Fallback: parse SKU out of data-name (e.g. "... Part # 5000169409 | DESC")
            sku, desc = parse_sku_from_name(raw_name)
            name = parse_name(desc) if sku else parse_name(raw_name)
        else:
            name = parse_name(raw_name)

        price = (attrs.get("data-product-price") or "").strip()
        href_m = href_figure_re.search(block) or href_fallback_re.search(block)
        product_url = href_m.group(1) if href_m else None

        image_url = None
        img_m = IMG_RE.search(block)
        if img_m:
            src_m = re.search(r'\ssrc="([^"]+)"', img_m.group(0))
            if src_m:
                image_url = src_m.group(1)

        rows.append({
            "part_number": sku,
            "alt_skus": ";".join(alt_skus),
            "name": name,
            "price": price,
            "currency": "USD",
            "vendor": attrs.get("data-product-brand") or "",
            "product_url": product_url,
            "image_url": image_url,
            "entity_id": attrs.get("data-entity-id"),
            "raw_sku": raw_sku,
            "raw_name": clean_mojibake(raw_name),
        })
    return rows


def detect_total_pages(page_html):
    m = PAGE_OF_RE.search(page_html)
    return int(m.group(1)) if m else None


def build_page_url(listing_url, page):
    sep = "&" if "?" in listing_url else "?"
    return f"{listing_url}{sep}page={page}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--listing-url", required=True,
                    help='e.g. "https://www.tmsequip.com/categories/parts/wacker-neuson-parts-lookup.html"')
    ap.add_argument("--out", required=True)
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--brand-filter", default=None,
                    help='only keep cards whose data-product-brand matches '
                         '(case-insensitive), e.g. "Wacker Neuson"')
    ap.add_argument("--delay", type=float, default=0.5)
    ap.add_argument("--limit-pages", type=int, default=None)
    args = ap.parse_args()

    parsed = urlparse(args.listing_url)
    host = f"{parsed.scheme}://{parsed.netloc}"

    rows = []
    page = 1
    total_pages = None
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        html_body = fetch(build_page_url(args.listing_url, page))
        if total_pages is None:
            total_pages = detect_total_pages(html_body)
            if total_pages:
                print(f"Detected {total_pages} total pages.")
        page_rows = parse_cards(html_body, host, brand_filter=args.brand_filter)
        if not page_rows:
            print(f"Page {page} had 0 cards — stopping.")
            break
        rows.extend(page_rows)
        print(f"  page {page:2d}: {len(page_rows):3d} rows (cumulative {len(rows)})",
              flush=True)
        if total_pages and page >= total_pages:
            print("Reached last page.")
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

    cols = [
        "part_number", "alt_skus", "name", "price", "currency", "vendor",
        "product_url", "image_url", "entity_id", "raw_sku", "raw_name",
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
