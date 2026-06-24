"""
Scrape every Wacker Neuson spare-part listed on stores.dhsequipmentparts.com.

The store is BigCommerce (Stencil theme); the brand listing page exposes
SKU, name, and price as inline `data-*` attributes on each product card,
so a single paginated HTML fetch is enough — no per-product page visits.

Usage:
  python scrape_dhs_wn.py [--out wn_dhs.csv] [--json wn_dhs.json]
                         [--delay 0.5] [--limit-pages N]

Output CSV columns:
  part_number, name, price, currency, vendor, product_url, image_url,
  entity_id, raw_sku, raw_name
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

import certifi

sys.stdout.reconfigure(encoding="utf-8")

BRAND_URL = "https://stores.dhsequipmentparts.com/brands/wacker-neuson/?page={page}"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())

CARD_RE = re.compile(r"<article\b[^>]*class=\"[^\"]*card\b[^\"]*\"[^>]*>", re.I)
ATTR_RE = re.compile(r'(\w[\w\-]*)\s*=\s*"([^"]*)"')
HREF_FIGURE_RE = re.compile(r'<a[^>]+class="card-figure__link"[^>]+href="([^"]+)"', re.I)
HREF_FALLBACK_RE = re.compile(
    r'href="(https://stores\.dhsequipmentparts\.com/[a-z0-9][a-z0-9\-]+/)"', re.I)
IMG_RE = re.compile(r'<img[^>]+class="card-image"[^>]*>', re.I)
BRAND_SUFFIX_RE = re.compile(r"[\s\-|]+wacker\s*neuson\s*$", re.I)


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
    # The source DB had latin-1 chars (″, °, etc.) that got transcoded badly;
    # they reach us as the U+FFFD replacement character, sometimes preceded by '?'.
    s = s.replace("?�", '"').replace("�", '"')
    return s


def split_pipes(raw):
    return [seg.strip() for seg in (raw or "").split("|") if seg.strip()]


def parse_sku(raw):
    """Returns (primary_sku, [alt_skus]).

    `data-sku` comes in two shapes:
      "5100053680-Wacker Neuson"  (hyphen-suffixed brand)
      "5000058666 | 58666 | Wacker Neuson"  (pipe-delimited alternates + brand)
    """
    cleaned = BRAND_SUFFIX_RE.sub("", raw or "").strip()
    segs = split_pipes(cleaned)
    segs = [s for s in segs if s.lower() not in ("wacker neuson", "wacker")]
    if not segs:
        return "", []
    return segs[0], segs[1:]


def parse_name(raw):
    """First pipe segment is the human name; rest are alt SKUs/models."""
    name = clean_mojibake(html.unescape(raw or "")).strip()
    segs = split_pipes(name)
    return segs[0] if segs else name


def parse_cards(page_html):
    """Yield row dicts from a brand-page HTML."""
    rows = []
    for m in CARD_RE.finditer(page_html):
        # Pull attribute key/values from the opening <article ...> tag.
        attrs = dict(ATTR_RE.findall(m.group(0)))
        # Find the card's full block: from this <article> to the matching </article>.
        start = m.start()
        end = page_html.find("</article>", start)
        block = page_html[start: end + len("</article>")] if end != -1 else page_html[start: start + 6000]

        raw_sku = attrs.get("data-sku", "")
        sku, alt_skus = parse_sku(raw_sku)
        raw_name = html.unescape(attrs.get("data-name", ""))
        name = parse_name(raw_name)

        price = (attrs.get("data-product-price") or "").strip()
        href_m = HREF_FIGURE_RE.search(block) or HREF_FALLBACK_RE.search(block)
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
            "vendor": attrs.get("data-product-brand") or "Wacker Neuson",
            "product_url": product_url,
            "image_url": image_url,
            "entity_id": attrs.get("data-entity-id"),
            "raw_sku": raw_sku,
            "raw_name": clean_mojibake(raw_name),
        })
    return rows


PAGE_OF_RE = re.compile(r"Page\s+\d+\s+of\s+(\d+)", re.I)


def detect_total_pages(page_html):
    m = PAGE_OF_RE.search(page_html)
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wn_dhs.csv")
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--delay", type=float, default=0.5)
    ap.add_argument("--limit-pages", type=int, default=None)
    args = ap.parse_args()

    rows = []
    page = 1
    total_pages = None
    while True:
        if args.limit_pages and page > args.limit_pages:
            print(f"Hit --limit-pages={args.limit_pages}; stopping.")
            break
        html_body = fetch(BRAND_URL.format(page=page))
        if total_pages is None:
            total_pages = detect_total_pages(html_body)
            if total_pages:
                print(f"Detected {total_pages} total pages.")
        page_rows = parse_cards(html_body)
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

    # Dedupe by entity_id (in case BigCommerce repeats across pages on edges).
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

    missing = {
        "part_number": sum(1 for r in deduped if not r["part_number"]),
        "name":        sum(1 for r in deduped if not r["name"]),
        "price":       sum(1 for r in deduped if not r["price"]),
    }
    print("Missing field counts:")
    for k, v in missing.items():
        print(f"  {k:13s} {v}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(deduped, f, indent=2, ensure_ascii=False)
        print(f"Also wrote {args.json_out}")


if __name__ == "__main__":
    main()
