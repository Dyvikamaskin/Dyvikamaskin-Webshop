"""
Deep-crawl Neyer.de Wacker Neuson catalog via the sitemap handle list,
bypassing Shopify's 25K pagination cap.

Reads `neyer_wacker_handles.json` (~45,735 handles from the sitemap walk),
fetches `/en/products/<handle>.json` for each, extracts price + full
enrichment data, writes one JSONL line per product. Parallel + resumable.

Usage:
  python scrape_neyer_full.py [--workers 20] [--out wn_neyer_full.jsonl]
                              [--limit N] [--locale en]

Outputs:
  wn_neyer_full.jsonl          — one product per line, all fields
  wn_neyer_full.csv            — price-comparison shape (for PartPriceSnapshot)
  scrape_neyer_full_report.json — counts, failures, elapsed
"""
import os
import sys
import csv
import json
import re
import time
import ssl
import argparse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

import certifi

sys.stdout.reconfigure(encoding="utf-8")
CTX = ssl.create_default_context(cafile=certifi.where())
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"

REPLACES_RE = re.compile(r"[Rr]eplaces\s+(?:item|part)?\s*([A-Z0-9]{6,})", re.IGNORECASE)


def fetch_product(host, locale, handle, retries=6):
    url = f"{host}/{locale}/products/{handle}.json"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last_err = e
            # Honor Retry-After on 429/503
            if e.code in (429, 503):
                ra = e.headers.get("Retry-After")
                wait = float(ra) if ra and ra.isdigit() else 2.0 * (2 ** attempt)
            else:
                wait = 1.0 * (2 ** attempt)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = 1.0 * (2 ** attempt)
        if attempt == retries - 1:
            break
        time.sleep(min(wait, 60))
    # Surface the failure class for diagnostics
    err_class = type(last_err).__name__
    code = getattr(last_err, "code", "") if last_err else ""
    raise RuntimeError(f"{err_class}{f' {code}' if code else ''}: {url}")


def flatten(data, handle, locale):
    """Extract the fields we care about from /products/<handle>.json."""
    p = data.get("product") or {}
    variants = p.get("variants") or []
    v = variants[0] if variants else {}
    images = p.get("images") or []

    # Parse "Replaces item X" from body_html
    body_html = p.get("body_html") or ""
    replaces = REPLACES_RE.findall(body_html)
    # Strip HTML for a clean plaintext description
    description_text = re.sub(r"<[^>]+>", " ", body_html)
    description_text = re.sub(r"\s+", " ", description_text).strip()

    return {
        "handle": handle,
        "locale": locale,
        "source_product_id": str(p.get("id") or ""),
        "sku": (v.get("sku") or "").strip(),
        "title": p.get("title") or "",
        "product_type": p.get("product_type") or "",
        "vendor": p.get("vendor") or "",
        "tags": p.get("tags") or "",
        "description_html": body_html,
        "description_text": description_text,
        "replaces_part_numbers": replaces,
        "price": v.get("price"),
        "compare_at_price": v.get("compare_at_price"),
        "currency": v.get("price_currency") or "EUR",
        "weight": v.get("weight"),
        "weight_unit": v.get("weight_unit"),
        "barcode": v.get("barcode"),
        "taxable": v.get("taxable"),
        "requires_shipping": v.get("requires_shipping"),
        "image_urls": [img.get("src") for img in images if img.get("src")],
        "image_count": len(images),
        "first_image_url": images[0].get("src") if images else None,
        "product_url": f"https://neyer.de/{locale}/products/{handle}",
        "source_created_at": p.get("created_at"),
        "source_updated_at": p.get("updated_at"),
        "published_at": p.get("published_at"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--handles", default="neyer_wacker_handles.json")
    ap.add_argument("--out", default="wn_neyer_full.jsonl")
    ap.add_argument("--csv-out", default="wn_neyer_full.csv")
    ap.add_argument("--host", default="https://neyer.de")
    ap.add_argument("--locale", default="en")
    ap.add_argument("--workers", type=int, default=20)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    with open(args.handles, encoding="utf-8") as f:
        handles = json.load(f)
    if args.limit:
        handles = handles[: args.limit]
    print(f"Loaded {len(handles):,} handles")

    # Resume support: skip handles already in the .jsonl
    seen_handles = set()
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            for line in f:
                try:
                    seen_handles.add(json.loads(line)["handle"])
                except Exception:
                    pass
        print(f"Resume: {len(seen_handles):,} handles already in {args.out}")
    todo = [h for h in handles if h not in seen_handles]
    print(f"To fetch: {len(todo):,}")

    failures = []
    not_found = []
    written = 0
    t0 = time.time()

    out_f = open(args.out, "a", encoding="utf-8", newline="")
    try:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(fetch_product, args.host, args.locale, h): h for h in todo}
            for i, fut in enumerate(as_completed(futures), 1):
                h = futures[fut]
                try:
                    data = fut.result()
                except Exception as e:
                    failures.append({"handle": h, "error": str(e)})
                    continue
                if data is None:
                    not_found.append(h)
                    continue
                row = flatten(data, h, args.locale)
                out_f.write(json.dumps(row, ensure_ascii=False) + "\n")
                written += 1
                if i % 500 == 0 or i == len(todo):
                    elapsed = time.time() - t0
                    rate = i / elapsed if elapsed else 0
                    eta = (len(todo) - i) / rate if rate else 0
                    # Tally failure classes so we can see the failure mix live
                    from collections import Counter
                    last_5_err_classes = Counter(
                        f["error"].split(":")[0] for f in failures[-200:]
                    ).most_common(3)
                    print(f"  [{i:>6}/{len(todo)}] written={written} 404={len(not_found)} "
                          f"fail={len(failures)}  rate={rate:.1f}/s  eta={eta/60:.1f}min  "
                          f"recent_errs={last_5_err_classes}",
                          flush=True)
                if i % 100 == 0:
                    out_f.flush()
    finally:
        out_f.close()

    elapsed = time.time() - t0
    print(f"\nFetched {written} (+{len(not_found)} 404, {len(failures)} fail) in {elapsed/60:.1f} min")

    # Emit a price-comparison CSV from the JSONL
    print(f"Emitting {args.csv_out} (PartPriceSnapshot shape)...")
    cols = ["part_number", "name", "price", "currency", "vendor",
            "product_url", "image_url", "entity_id", "raw_sku", "raw_name"]
    rows_written = 0
    with open(args.out, encoding="utf-8") as src, \
            open(args.csv_out, "w", encoding="utf-8", newline="") as dst:
        w = csv.DictWriter(dst, fieldnames=cols)
        w.writeheader()
        for line in src:
            r = json.loads(line)
            sku = (r.get("sku") or "").strip()
            if not sku:
                continue
            w.writerow({
                "part_number": sku,
                "name": r.get("title") or "",
                "price": r.get("price") or "",
                "currency": r.get("currency") or "EUR",
                "vendor": r.get("vendor") or "Wacker Neuson",
                "product_url": r.get("product_url") or "",
                "image_url": r.get("first_image_url") or "",
                "entity_id": r.get("source_product_id") or "",
                "raw_sku": sku,
                "raw_name": r.get("title") or "",
            })
            rows_written += 1
    print(f"Wrote {rows_written} rows to {args.csv_out}")

    report = {
        "handles_total": len(handles),
        "written": written,
        "not_found": len(not_found),
        "failed": len(failures),
        "elapsed_seconds": elapsed,
        "first_5_failures": failures[:5],
        "first_5_not_found": not_found[:5],
    }
    with open("scrape_neyer_full_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("Wrote scrape_neyer_full_report.json")


if __name__ == "__main__":
    main()
