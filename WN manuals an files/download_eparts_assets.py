"""
Download every HD diagram PNG + .hd3 click-coord file referenced in eparts/*.json.

Endpoint: /ws/v2/amd/media/{id}/{filename}  — public, anonymous, gzipped.

Output: eparts_assets/{filename} (flat, deduplicated by filename).
Resumable: files already present (non-zero size) are skipped.

Usage:
  python download_eparts_assets.py [--out-dir eparts_assets]
                                   [--workers 8] [--limit N]
"""
import os
import sys
import json
import time
import ssl
import argparse
import glob
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

import certifi

sys.stdout.reconfigure(encoding="utf-8")

HOST = "https://shop.wackerneuson.com"
MEDIA_URL = HOST + "/ws/v2/amd/media/{id}/{filename}?lang=en_US&mode=unrestricted"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())


def gather_assets():
    """Walk every eparts/*.json and collect (filename → id) for PNG + .hd3."""
    pngs = {}
    hd3s = {}
    for path in glob.glob("eparts/*.json"):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        for rev in d.get("revisions") or []:
            def walk(devs):
                for dev in devs:
                    comp = dev.get("component") or {}
                    diag = comp.get("diagram") or {}
                    img = diag.get("diagramImage") or {}
                    hd3 = diag.get("diagramCoordinates") or {}
                    if img.get("id") and img.get("filename"):
                        pngs.setdefault(img["filename"], img["id"])
                    if hd3.get("id") and hd3.get("filename"):
                        hd3s.setdefault(hd3["filename"], hd3["id"])
            walk(rev.get("components") or [])
            for sub in rev.get("sub_revisions") or []:
                walk(sub.get("devices") or [])
    return pngs, hd3s


def fetch_one(media_id, filename, out_dir, retries=3):
    dest = os.path.join(out_dir, filename)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return ("skipped", filename, 0)
    part = dest + ".part"
    url = MEDIA_URL.format(id=media_id, filename=filename)
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "*/*",
                "Referer": HOST + "/eparts/",
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
            return ("ok", filename, total)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError, OSError) as e:
            last_err = e
            try:
                if os.path.exists(part):
                    os.remove(part)
            except OSError:
                pass
            time.sleep(2 ** attempt)
    return ("failed", filename, str(last_err))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default="eparts_assets")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=None,
                    help="stop after attempting N files (debug)")
    ap.add_argument("--report", default="eparts_assets_report.json")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    print("Scanning eparts/*.json ...", flush=True)
    pngs, hd3s = gather_assets()
    print(f"  unique PNGs: {len(pngs):,}")
    print(f"  unique .hd3: {len(hd3s):,}")
    print(f"  total:       {len(pngs) + len(hd3s):,}")

    jobs = [(mid, fn) for fn, mid in pngs.items()] + [(mid, fn) for fn, mid in hd3s.items()]
    if args.limit:
        jobs = jobs[: args.limit]
        print(f"--limit={args.limit} → {len(jobs)} jobs")

    started = time.time()
    ok = 0
    skipped = 0
    failed = 0
    bytes_total = 0
    failures = []

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = [ex.submit(fetch_one, mid, fn, args.out_dir) for mid, fn in jobs]
        for i, fut in enumerate(as_completed(futures), 1):
            status, name, info = fut.result()
            if status == "ok":
                ok += 1
                bytes_total += info
            elif status == "skipped":
                skipped += 1
            else:
                failed += 1
                failures.append({"filename": name, "error": str(info)})
            if i % 100 == 0 or i == len(jobs):
                elapsed = time.time() - started
                rate = i / elapsed if elapsed > 0 else 0
                mb = bytes_total / 1024 / 1024
                eta_s = (len(jobs) - i) / rate if rate > 0 else 0
                print(f"  [{i:>5}/{len(jobs)}] ok={ok} skip={skipped} fail={failed} "
                      f"{mb:.1f} MB  ({rate:.1f}/s, eta {eta_s/60:.1f} min)",
                      flush=True)

    elapsed = time.time() - started
    print()
    print(f"Done. ok={ok}  skipped={skipped}  failed={failed}")
    print(f"  bytes downloaded: {bytes_total/1024/1024:.1f} MB  ({bytes_total/1024/1024/1024:.2f} GB)")
    print(f"  elapsed: {elapsed/60:.1f} min")
    if failures:
        print(f"  first 5 failures:")
        for f in failures[:5]:
            print(f"    {f['filename']}: {f['error'][:120]}")

    report = {
        "ok": ok,
        "skipped": skipped,
        "failed": failed,
        "bytes_downloaded": bytes_total,
        "elapsed_seconds": elapsed,
        "failures": failures,
    }
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"  report → {args.report}")


if __name__ == "__main__":
    main()
