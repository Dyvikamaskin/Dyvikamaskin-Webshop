"""
Download every parts-manual PDF referenced by wn_catalogue.json.

Reads `partsManuals[].url` (each pre-signed with a Hybris `context` token)
and saves to `pdfs_shop/`. Resumable — files already present (non-zero
size) are skipped. Writes to `<name>.part` first, then renames on success
so an interrupted run never leaves a corrupt PDF in place.

Usage:
  python download_wn_parts_pdfs.py [--out-dir pdfs_shop] [--delay 0.4]
                                   [--limit N] [--report wn_download_report.json]
"""
import os
import sys
import json
import time
import ssl
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

import certifi

sys.stdout.reconfigure(encoding="utf-8")

HOST = "https://shop.wackerneuson.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())


def stream_download(url, dest_path, retries=3, chunk=1 << 15):
    """Download URL to dest_path via .part rename. Returns (bytes, error)."""
    part = dest_path + ".part"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/pdf,*/*;q=0.8",
                "Referer": HOST + "/eparts/",
            })
            with urllib.request.urlopen(req, timeout=60, context=CTX) as resp, \
                    open(part, "wb") as f:
                ctype = resp.headers.get("Content-Type", "")
                if "pdf" not in ctype.lower():
                    raise RuntimeError(f"unexpected content-type {ctype!r}")
                total = 0
                while True:
                    buf = resp.read(chunk)
                    if not buf:
                        break
                    f.write(buf)
                    total += len(buf)
            if total == 0:
                raise RuntimeError("zero bytes received")
            os.replace(part, dest_path)
            return total, None
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                RuntimeError, OSError) as e:
            last_err = e
            try:
                if os.path.exists(part):
                    os.remove(part)
            except OSError:
                pass
            wait = 2 ** attempt
            print(f"    ! attempt {attempt+1} failed ({e}); retry in {wait}s",
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    return 0, str(last_err) if last_err else "unknown error"


def safe_filename(name):
    keep = "._- "
    return "".join(c if c.isalnum() or c in keep else "_" for c in name).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalogue", default="wn_catalogue.json")
    ap.add_argument("--out-dir", default="pdfs_shop")
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--limit", type=int, default=None,
                    help="stop after attempting N downloads (debug)")
    ap.add_argument("--report", default="wn_download_report.json")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    with open(args.catalogue, encoding="utf-8") as f:
        d = json.load(f)

    # Collect (filename, url, machines[]) — dedupe by filename so a shared
    # PDF that 5 machines reference is downloaded once.
    by_fn = {}
    for m in d["machines"]:
        for pm in m["parts_manuals"]:
            fn = pm.get("filename")
            url = pm.get("url")
            if not fn or not url:
                continue
            fn = safe_filename(fn)
            full_url = url if url.startswith("http") else HOST + url
            entry = by_fn.setdefault(fn, {
                "filename": fn,
                "url": full_url,
                "expected_size": pm.get("size"),
                "machines": [],
            })
            entry["machines"].append(m["code"])

    targets = list(by_fn.values())
    print(f"Manifest: {len(targets)} unique parts PDFs "
          f"(across {sum(len(t['machines']) for t in targets)} machine refs)")

    downloaded = []
    skipped = []
    failed = []
    bytes_total = 0
    started = time.time()

    for i, t in enumerate(targets, 1):
        if args.limit and i > args.limit:
            print(f"Hit --limit={args.limit}; stopping.")
            break

        dest = os.path.join(args.out_dir, t["filename"])
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            skipped.append(t["filename"])
            if i % 25 == 0:
                print(f"  [{i}/{len(targets)}] skip (already on disk): {t['filename']}",
                      flush=True)
            continue

        print(f"  [{i}/{len(targets)}] {t['filename']} "
              f"(expected ~{(t['expected_size'] or 0)/1024/1024:.1f} MB) ...",
              end="", flush=True)
        size, err = stream_download(t["url"], dest)
        if err:
            print(f" FAILED ({err})")
            failed.append({"filename": t["filename"], "url": t["url"], "error": err})
        else:
            print(f" {size/1024/1024:.1f} MB")
            downloaded.append({"filename": t["filename"], "bytes": size})
            bytes_total += size
        time.sleep(args.delay)

    elapsed = time.time() - started
    print()
    print("=" * 60)
    print(f"Downloaded: {len(downloaded)}  ({bytes_total/1024/1024:.1f} MB)")
    print(f"Skipped:    {len(skipped)}  (already on disk)")
    print(f"Failed:     {len(failed)}")
    print(f"Elapsed:    {elapsed/60:.1f} min")
    if failed:
        print("\nFailures:")
        for f in failed[:10]:
            print(f"  {f['filename']}  {f['error']}")
        if len(failed) > 10:
            print(f"  ... and {len(failed) - 10} more (see report)")

    report = {
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "out_dir": args.out_dir,
        "total_targets": len(targets),
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
        "bytes_downloaded": bytes_total,
        "elapsed_seconds": elapsed,
    }
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nReport: {args.report}")


if __name__ == "__main__":
    main()
