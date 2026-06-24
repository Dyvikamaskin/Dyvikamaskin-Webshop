"""
Download Neyer.de Wacker product images to local disk.

Input source modes:
  --from-jsonl wn_neyer_full.jsonl   (read URLs directly from scrape output)
  --from-db                          (query OemPartListing.imageUrls from Supabase)

Filter modes:
  --all                              (default — download images for every SKU)
  --skus path/to/skus.txt            (only SKUs in this list, one per line)
  --match-product                    (only SKUs that match Product.partNumber or
                                      Product.replacesPartNumbers in the DB)

Naming convention (sharded by SKU prefix to keep filesystem snappy):
  neyer_images/<sku[:4]>/<sku>/<position:02d>_<sanitised-basename>.<ext>

Resumable — files already present (non-zero size) are skipped.

Usage:
  python download_neyer_images.py --from-jsonl wn_neyer_full.jsonl \\
      --workers 16 --out-dir neyer_images
"""
import os
import sys
import re
import json
import time
import ssl
import argparse
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

import certifi

sys.stdout.reconfigure(encoding="utf-8")
CTX = ssl.create_default_context(cafile=certifi.where())
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"

SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
SHARD_KEYS = 4  # group SKUs by first N chars to avoid 45K dirs at top level


def sanitise(name: str) -> str:
    return SAFE_FILENAME_RE.sub("_", name).strip("_")[:120] or "img"


def url_to_basename(url: str) -> str:
    """Get the original filename from the URL, stripped of query string."""
    path = urllib.parse.urlparse(url).path
    base = os.path.basename(path)
    return sanitise(base)


def dest_path(out_dir: str, sku: str, position: int, url: str) -> str:
    shard = sku[:SHARD_KEYS] if len(sku) >= SHARD_KEYS else sku
    basename = url_to_basename(url)
    fname = f"{position:02d}_{basename}"
    return os.path.join(out_dir, shard, sku, fname)


def download_one(url: str, dest: str, retries: int = 3) -> tuple[str, int | str]:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return ("skipped", 0)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    part = dest + ".part"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5",
            })
            with urllib.request.urlopen(req, timeout=60, context=CTX) as resp, \
                    open(part, "wb") as f:
                total = 0
                while True:
                    buf = resp.read(1 << 15)
                    if not buf:
                        break
                    f.write(buf)
                    total += len(buf)
            if total == 0:
                raise RuntimeError("zero bytes")
            os.replace(part, dest)
            return ("ok", total)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                RuntimeError, OSError) as e:
            last_err = e
            try:
                if os.path.exists(part):
                    os.remove(part)
            except OSError:
                pass
            time.sleep(2 ** attempt)
    return ("failed", str(last_err))


def iter_url_jobs_from_jsonl(path: str):
    """Yield (sku, position, url) tuples by re-reading the JSONL each time we're called.
    The JSONL may still be growing during a parallel scrape; we re-read on each call."""
    seen = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue
            sku = (r.get("sku") or "").strip()
            if not sku:
                continue
            urls = r.get("image_urls") or []
            for i, u in enumerate(urls, 1):
                if not u: continue
                key = (sku, i, u)
                if key in seen: continue
                seen.add(key)
                yield sku, i, u


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-jsonl", default="wn_neyer_full.jsonl")
    ap.add_argument("--out-dir", default="neyer_images")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--limit", type=int, default=None, help="cap total downloads (debug)")
    ap.add_argument("--skus", default=None,
                    help="optional file with one SKU per line to filter to")
    ap.add_argument("--report", default="download_neyer_images_report.json")
    args = ap.parse_args()

    sku_filter: set[str] | None = None
    if args.skus and os.path.exists(args.skus):
        with open(args.skus, encoding="utf-8") as f:
            sku_filter = {l.strip() for l in f if l.strip()}
        print(f"Filtering to {len(sku_filter)} SKUs from {args.skus}")

    print(f"Reading URL list from {args.from_jsonl} ...")
    jobs = []
    for sku, position, url in iter_url_jobs_from_jsonl(args.from_jsonl):
        if sku_filter is not None and sku not in sku_filter:
            continue
        jobs.append((sku, position, url))
    print(f"Total image jobs: {len(jobs):,}")
    if args.limit:
        jobs = jobs[: args.limit]
        print(f"--limit={args.limit} → {len(jobs)} jobs")

    os.makedirs(args.out_dir, exist_ok=True)

    started = time.time()
    ok = 0; skipped = 0; failed = 0; bytes_total = 0
    failures = []

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {
            ex.submit(download_one, url, dest_path(args.out_dir, sku, pos, url)): (sku, pos, url)
            for sku, pos, url in jobs
        }
        for i, fut in enumerate(as_completed(futures), 1):
            sku, pos, url = futures[fut]
            status, info = fut.result()
            if status == "ok":
                ok += 1
                bytes_total += info if isinstance(info, int) else 0
            elif status == "skipped":
                skipped += 1
            else:
                failed += 1
                failures.append({"sku": sku, "url": url, "error": str(info)[:200]})
            if i % 250 == 0 or i == len(jobs):
                elapsed = time.time() - started
                rate = i / elapsed if elapsed > 0 else 0
                mb = bytes_total / 1024 / 1024
                eta = (len(jobs) - i) / rate if rate > 0 else 0
                print(f"  [{i:>6}/{len(jobs)}] ok={ok} skip={skipped} fail={failed} "
                      f"{mb:.0f} MB  ({rate:.1f}/s, eta {eta/60:.0f} min)",
                      flush=True)

    elapsed = time.time() - started
    print()
    print(f"Done. ok={ok} skipped={skipped} failed={failed}")
    print(f"  bytes downloaded: {bytes_total/1024/1024/1024:.2f} GB")
    print(f"  elapsed: {elapsed/60:.1f} min")

    report = {
        "from_jsonl": args.from_jsonl,
        "out_dir": args.out_dir,
        "total_jobs": len(jobs),
        "ok": ok,
        "skipped": skipped,
        "failed": failed,
        "bytes_downloaded": bytes_total,
        "elapsed_seconds": elapsed,
        "failures_first_20": failures[:20],
    }
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"  report → {args.report}")


if __name__ == "__main__":
    main()
