"""
Scrape DHS Equipment Parts (stores.dhsequipmentparts.com) for the
'Compatibility & Fitment' table on each product page.

Targets only the SKUs that intersect our OEM catalog OR your inventory —
not the full 144K DHS catalog. That keeps the run polite and the result
focused on parts we actually care about.

Output: dhs_fitment.jsonl — one product per line:
  {
    "sku":   "5000110185",            # DHS part_number
    "url":   "https://stores.dhs...",
    "title": "Wacker WP1540 WP1550 Exciter Shaft",
    "fitment": [
      {"name": "Vibratory Plate, 15kN, 400mm", "model": "WP1540AW",
       "machine_numbers": ["5000008060","5000009545","5000009472","5000630045"]},
      ...
    ],
    "scraped_at": "2026-06-24T..."
  }

Resumable — skips SKUs already in the output file.
Polite — 4 workers, exponential backoff on 429/5xx, honors Retry-After.

Usage:
  python scrape_dhs_fitment.py [--workers 4] [--limit N] [--target oem|inv|both]
"""
import argparse
import csv
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import certifi

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CTX = ssl.create_default_context(cafile=certifi.where())
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/126.0 Safari/537.36")

DHS_CSV = "wn_dhs_klevu.csv"

# Compiled extractors
FITMENT_TABLE_RE = re.compile(
    r'<table[^>]*class="[^"]*fitment-table[^"]*"[^>]*>([\s\S]*?)</table>',
    re.I,
)
ROW_RE = re.compile(r"<tr[^>]*>([\s\S]*?)</tr>", re.I)
TD_RE = re.compile(r"<td[^>]*>([\s\S]*?)</td>", re.I)
TITLE_RE = re.compile(r"<title[^>]*>([\s\S]*?)</title>", re.I)
MACHINE_NUM_RE = re.compile(r"[15]\d{9}|0\d{6}")


def clean(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;|&#160;", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"&lt;", "<", s)
    s = re.sub(r"&gt;", ">", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def extract_fitment(html: str) -> list[dict]:
    out = []
    m = FITMENT_TABLE_RE.search(html)
    if not m:
        return out
    table = m.group(1)
    # Skip the header row (its tds are <th>, not <td>)
    for row_m in ROW_RE.finditer(table):
        tds = TD_RE.findall(row_m.group(1))
        if len(tds) < 3:
            continue
        name = clean(tds[0])
        model = clean(tds[1])
        machine_cell = clean(tds[2])
        nums = MACHINE_NUM_RE.findall(machine_cell)
        out.append({"name": name, "model": model, "machine_numbers": nums})
    return out


def fetch(url: str, retries: int = 4, timeout: int = 30):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return r.status, r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return e.code, ""
            last_err = e
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
    raise RuntimeError(f"{type(last_err).__name__} {getattr(last_err,'code','')}: {url}")


def scrape_one(sku: str, url: str) -> dict:
    status, html = fetch(url)
    if status in (404, 410) or not html:
        return {"sku": sku, "url": url, "status": status, "fitment": [],
                "title": None, "scraped_at": datetime.now(timezone.utc).isoformat()}
    title_m = TITLE_RE.search(html)
    title = clean(title_m.group(1)) if title_m else None
    fitment = extract_fitment(html)
    return {"sku": sku, "url": url, "status": status, "title": title,
            "fitment": fitment, "scraped_at": datetime.now(timezone.utc).isoformat()}


def load_target_set(target: str) -> set[str]:
    """OEM partNumbers + inventory SKUs (per --target flag)."""
    targets = set()
    if target in ("oem", "both"):
        # Read the OEM dump we already have on disk
        raw = open(os.path.join(HERE, "oem_skus_dump.txt"), encoding="utf-8").read()
        oem = set(re.findall(
            r'(?:\\")?partNumber(?:\\")?\s*:\s*(?:\\")?([^"\\,}]+)', raw))
        print(f"  OEM SKUs loaded: {len(oem):,}")
        targets |= oem
    if target in ("inv", "both"):
        # Read inventory SKUs we already extracted
        inv = set()
        with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
            for r in csv.DictReader(f):
                for t in (r["wacker_skus_found"] or "").split(";"):
                    t = t.strip()
                    if t: inv.add(t)
        print(f"  Inventory SKUs loaded: {len(inv):,}")
        targets |= inv
    return targets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=["oem", "inv", "both"], default="both",
                    help="Which SKU set to filter to (default: both)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=os.path.join(HERE, "dhs_fitment.jsonl"))
    ap.add_argument("--report", default=os.path.join(HERE, "scrape_dhs_fitment_report.json"))
    args = ap.parse_args()

    print(f"Loading target SKU set (--target={args.target}) ...")
    target_skus = load_target_set(args.target)
    print(f"  Combined target SKUs: {len(target_skus):,}")

    print(f"\nReading {DHS_CSV} ...")
    todo = []
    with open(os.path.join(HERE, DHS_CSV), encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            sku = (row.get("part_number") or "").strip()
            url = (row.get("product_url") or "").strip()
            if not url or not url.startswith("http"):
                continue
            if sku not in target_skus:
                continue
            todo.append((sku, url))
    print(f"  Filtered DHS rows in target: {len(todo):,}")

    # Resume
    done = set()
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line)["sku"])
                except Exception:
                    pass
        print(f"  Resume: {len(done):,} already in {args.out}")
    todo = [t for t in todo if t[0] not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"  To fetch: {len(todo):,}\n")

    started = time.time()
    ok = 0
    fail = 0
    no_fitment = 0
    failures: list[dict] = []

    out_f = open(args.out, "a", encoding="utf-8", newline="")
    try:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(scrape_one, sku, url): (sku, url) for sku, url in todo}
            for i, fut in enumerate(as_completed(futures), 1):
                sku, url = futures[fut]
                try:
                    rec = fut.result()
                    out_f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    if rec.get("fitment"):
                        ok += 1
                    else:
                        no_fitment += 1
                except Exception as e:
                    fail += 1
                    failures.append({"sku": sku, "url": url, "error": str(e)[:200]})
                if i % 100 == 0 or i == len(todo):
                    elapsed = time.time() - started
                    rate = i / elapsed if elapsed > 0 else 0
                    eta = (len(todo) - i) / rate if rate > 0 else 0
                    print(f"  [{i:>6}/{len(todo)}] with_fitment={ok}  "
                          f"no_fitment={no_fitment}  fail={fail}  "
                          f"({rate:.1f}/s, eta {eta/60:.0f} min)", flush=True)
                if i % 50 == 0:
                    out_f.flush()
    finally:
        out_f.close()

    elapsed = time.time() - started
    print(f"\nDone. with_fitment={ok}  no_fitment={no_fitment}  fail={fail}  "
          f"elapsed={elapsed/60:.1f} min")

    with open(args.report, "w", encoding="utf-8") as f:
        json.dump({
            "target": args.target,
            "total_todo": len(todo),
            "ok_with_fitment": ok,
            "ok_no_fitment": no_fitment,
            "failed": fail,
            "elapsed_seconds": elapsed,
            "first_20_failures": failures[:20],
        }, f, ensure_ascii=False, indent=2)
    print(f"Wrote {args.report}")


if __name__ == "__main__":
    main()
