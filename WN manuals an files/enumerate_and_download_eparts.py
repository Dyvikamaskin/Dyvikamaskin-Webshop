"""
Walk the full shop.wackerneuson.com eParts catalog tree, enumerate every
machine, then fetch the documents endpoint for each (machine, revision) pair
and download every Parts Manual PDF.

Pipeline:
  Phase 1 — walk /navigation/categories/10 recursively, collect every
            {name, code, category_path} machine entry
  Phase 2 — for each new machine code, GET /navigation/products/{code} to
            discover its revisions (uses 4-worker concurrency)
  Phase 3 — for each (machine, revision), GET /machine/details/{code}/revision/{rev}
            to extract every PDF URL (parts manuals + optionally operating manuals)
  Phase 4 — download every unique Parts Manual PDF to eparts_pdfs/

Outputs:
  eparts_all_machines.json        — full machine list with category paths
  eparts_machine_revisions.json   — machine → [revisions]
  eparts_pdf_urls.json            — all unique PDF entries with signed URLs
  eparts_pdfs/<filename>          — downloaded Parts Manual PDFs
  enumerate_eparts_report.json    — per-phase counts and timing

Resumable: each phase reads its prior phase's output file; PDFs already on disk
are skipped on size>0.

Usage:
  python enumerate_and_download_eparts.py \\
      [--workers 4] [--phase all|1|2|3|4] [--with-operator-manuals]
"""
import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import certifi

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CTX = ssl.create_default_context(cafile=certifi.where())
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/126.0 Safari/537.36")
BASE = "https://shop.wackerneuson.com"
WS = f"{BASE}/ws/v2/amd"

OUT_MACHINES = os.path.join(HERE, "eparts_all_machines.json")
OUT_REVISIONS = os.path.join(HERE, "eparts_machine_revisions.json")
OUT_PDF_URLS = os.path.join(HERE, "eparts_pdf_urls.json")
OUT_PDF_DIR = os.path.join(HERE, "eparts_pdfs")
REPORT = os.path.join(HERE, "enumerate_eparts_report.json")


def fetch_json(url: str, retries: int = 4, timeout: int = 30):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json, text/plain, */*",
                "Referer": f"{BASE}/eparts/",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None
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


# =====================================================================
# Phase 1 — enumerate categories
# =====================================================================
def phase1():
    print("=" * 60); print("PHASE 1: walk category tree"); print("=" * 60)
    machines = {}    # code → {name, category_path}
    visited_categories = set()

    def walk(cat_id: str, path: list[str]):
        if cat_id in visited_categories: return
        visited_categories.add(cat_id)
        url = f"{WS}/navigation/categories/{cat_id}?lang=en_US&mode=unrestricted"
        try:
            data = fetch_json(url)
        except Exception as e:
            print(f"  ! category {cat_id} failed: {e}", flush=True)
            return
        if not data: return
        my_path = path + [data.get("name", f"cat{cat_id}")]
        for prod in (data.get("products") or []):
            code = prod.get("code"); name = prod.get("name", "")
            if not code: continue
            if code not in machines:
                machines[code] = {
                    "code": code, "name": name,
                    "category_path": " > ".join(my_path),
                }
        for sub in (data.get("subcategories") or []):
            if sub.get("id"):
                walk(sub["id"], my_path)

    walk("10", [])
    print(f"  Visited categories: {len(visited_categories):,}")
    print(f"  Machines discovered: {len(machines):,}")
    # Per-top-category breakdown
    by_top = {}
    for m in machines.values():
        top = m["category_path"].split(" > ")[1] if " > " in m["category_path"] else m["category_path"]
        by_top[top] = by_top.get(top, 0) + 1
    print("\n  Machines per top-level category:")
    for k, v in sorted(by_top.items(), key=lambda kv: -kv[1]):
        print(f"    {k:<40s} {v:>4,}")
    with open(OUT_MACHINES, "w", encoding="utf-8") as f:
        json.dump(list(machines.values()), f, ensure_ascii=False, indent=2)
    print(f"\n  Wrote {OUT_MACHINES}")
    return machines


# =====================================================================
# Phase 2 — fetch revisions per machine via /navigation/products/{code}
# =====================================================================
def phase2(machines: dict, workers: int = 4):
    print("\n" + "=" * 60); print("PHASE 2: fetch revisions per machine"); print("=" * 60)
    # Resume — load existing revisions file if present
    existing = {}
    if os.path.exists(OUT_REVISIONS):
        existing = json.load(open(OUT_REVISIONS, encoding="utf-8"))
        print(f"  Resume: {len(existing):,} machines already have revisions")
    todo = [c for c in machines if c not in existing]
    print(f"  To fetch: {len(todo):,}")

    started = time.time()

    def fetch_revs(code: str):
        url = f"{WS}/navigation/products/{code}?lang=en_US&mode=unrestricted"
        data = fetch_json(url)
        revs = []
        if data:
            # Capture the revision list. Shape: {"revisions":[{"revision":"101", ...}]}
            for r in (data.get("revisions") or []):
                rv = r.get("revision")
                if rv: revs.append(str(rv))
        return code, revs

    results = dict(existing)
    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(fetch_revs, c): c for c in todo}
        for fut in as_completed(futures):
            c = futures[fut]
            try:
                code, revs = fut.result()
                results[code] = revs
            except Exception as e:
                print(f"  ! {c}: {e}", flush=True)
                results[c] = []
            completed += 1
            if completed % 50 == 0 or completed == len(todo):
                el = time.time() - started
                rate = completed / el if el > 0 else 0
                eta = (len(todo) - completed) / rate if rate > 0 else 0
                print(f"  [{completed:>5}/{len(todo)}] rate={rate:.1f}/s "
                      f"eta={eta/60:.0f} min", flush=True)
                with open(OUT_REVISIONS, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)

    with open(OUT_REVISIONS, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    n_with = sum(1 for v in results.values() if v)
    print(f"\n  Machines with ≥1 revision: {n_with:,}/{len(results):,}")
    print(f"  Wrote {OUT_REVISIONS}")
    return results


# =====================================================================
# Phase 3 — fetch documents (PDF URLs) per (machine, revision)
# =====================================================================
def phase3(revisions: dict, workers: int = 4, with_operator_manuals: bool = False):
    print("\n" + "=" * 60); print("PHASE 3: fetch documents per (machine, revision)"); print("=" * 60)
    # Build (code, rev) work list
    work = []
    for code, revs in revisions.items():
        for rev in revs:
            work.append((code, rev))
    print(f"  (machine, revision) pairs: {len(work):,}")

    # Resume: load existing PDF URLs file
    existing = {}
    if os.path.exists(OUT_PDF_URLS):
        existing = json.load(open(OUT_PDF_URLS, encoding="utf-8"))
        print(f"  Resume: {len(existing):,} pairs already have docs metadata")
    todo = [w for w in work if f"{w[0]}_{w[1]}" not in existing]
    print(f"  To fetch: {len(todo):,}")

    started = time.time()

    def fetch_docs(code: str, rev: str):
        url = f"{WS}/machine/details/{code}/revision/{rev}?lang=en_US&mode=unrestricted"
        data = fetch_json(url)
        if not data: return code, rev, None
        return code, rev, {
            "productName": data.get("productName"),
            "imageUrl": data.get("imageUrl"),
            "partsManuals": data.get("partsManuals") or [],
            "operatingManuals": (data.get("operatingManuals") or []) if with_operator_manuals else [],
        }

    results = dict(existing)
    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(fetch_docs, c, r): (c, r) for c, r in todo}
        for fut in as_completed(futures):
            c, r = futures[fut]
            key = f"{c}_{r}"
            try:
                code, rev, info = fut.result()
                results[key] = info
            except Exception as e:
                print(f"  ! {key}: {e}", flush=True)
                results[key] = None
            completed += 1
            if completed % 50 == 0 or completed == len(todo):
                el = time.time() - started
                rate = completed / el if el > 0 else 0
                eta = (len(todo) - completed) / rate if rate > 0 else 0
                print(f"  [{completed:>5}/{len(todo)}] rate={rate:.1f}/s "
                      f"eta={eta/60:.0f} min", flush=True)
                with open(OUT_PDF_URLS, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)

    with open(OUT_PDF_URLS, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    n_with_pm = sum(1 for v in results.values()
                    if v and v.get("partsManuals"))
    print(f"\n  Pairs with ≥1 parts manual: {n_with_pm:,}/{len(results):,}")
    print(f"  Wrote {OUT_PDF_URLS}")
    return results


# =====================================================================
# Phase 4 — download Parts Manual PDFs
# =====================================================================
def phase4(pdf_urls: dict, workers: int = 4, with_operator_manuals: bool = False):
    print("\n" + "=" * 60); print("PHASE 4: download Parts Manual PDFs"); print("=" * 60)
    os.makedirs(OUT_PDF_DIR, exist_ok=True)

    # Build the unique-PDF list. Dedupe by filename.
    unique = {}
    for key, info in pdf_urls.items():
        if not info: continue
        for pm in info.get("partsManuals", []):
            fname = pm.get("filename"); url = pm.get("url")
            if fname and url: unique[fname] = (url, pm.get("size", 0), key)
        if with_operator_manuals:
            for om in info.get("operatingManuals", []):
                fname = om.get("filename"); url = om.get("url")
                if fname and url:
                    unique["om_" + fname] = (url, om.get("size", 0), key)
    print(f"  Unique PDF files to fetch: {len(unique):,}")

    started = time.time()
    ok = 0; skip = 0; fail = 0
    failures = []

    def download(fname: str, url: str, expected_size: int):
        dest = os.path.join(OUT_PDF_DIR, fname)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            return "skip", dest, 0
        full_url = url if url.startswith("http") else f"{BASE}{url}"
        part = dest + ".part"
        last_err = None
        for attempt in range(4):
            try:
                req = urllib.request.Request(full_url, headers={
                    "User-Agent": UA,
                    "Accept": "application/pdf,*/*;q=0.5",
                    "Referer": f"{BASE}/eparts/",
                })
                with urllib.request.urlopen(req, timeout=120, context=CTX) as r, \
                        open(part, "wb") as fh:
                    n = 0
                    while True:
                        buf = r.read(1 << 16)
                        if not buf: break
                        fh.write(buf); n += len(buf)
                if n == 0: raise RuntimeError("zero bytes")
                os.replace(part, dest)
                return "ok", dest, n
            except (urllib.error.URLError, urllib.error.HTTPError,
                    TimeoutError, RuntimeError, OSError) as e:
                last_err = e
                try: os.remove(part)
                except OSError: pass
                time.sleep(min(2 ** attempt, 30))
        return "fail", dest, str(last_err)[:200]

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(download, fname, url, sz): fname
                   for fname, (url, sz, _src) in unique.items()}
        for i, fut in enumerate(as_completed(futures), 1):
            fname = futures[fut]
            status, _path, info = fut.result()
            if status == "ok":
                ok += 1
            elif status == "skip":
                skip += 1
            else:
                fail += 1
                failures.append({"filename": fname, "error": str(info)[:200]})
            if i % 25 == 0 or i == len(unique):
                el = time.time() - started
                rate = i / el if el > 0 else 0
                eta = (len(unique) - i) / rate if rate > 0 else 0
                print(f"  [{i:>5}/{len(unique)}] ok={ok} skip={skip} fail={fail} "
                      f"({rate:.1f}/s, eta {eta/60:.0f} min)", flush=True)

    print(f"\n  Done. ok={ok} skip={skip} fail={fail}")
    return {"ok": ok, "skip": skip, "fail": fail, "failures_first_20": failures[:20]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["all", "1", "2", "3", "4"], default="all")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--with-operator-manuals", action="store_true",
                    help="Also download Operator's manuals (~12 per machine in many languages)")
    args = ap.parse_args()

    t0 = time.time()
    report = {"started": datetime.now(timezone.utc).isoformat()}

    machines = None
    if args.phase in ("all", "1"):
        machines = phase1()
        report["phase1_machines"] = len(machines)
    elif os.path.exists(OUT_MACHINES):
        ms = json.load(open(OUT_MACHINES, encoding="utf-8"))
        machines = {m["code"]: m for m in ms}

    revisions = None
    if args.phase in ("all", "2"):
        if machines is None:
            print("Need phase 1 output to run phase 2."); sys.exit(1)
        revisions = phase2(machines, workers=args.workers)
        report["phase2_machines_with_revs"] = sum(1 for v in revisions.values() if v)
    elif os.path.exists(OUT_REVISIONS):
        revisions = json.load(open(OUT_REVISIONS, encoding="utf-8"))

    pdf_urls = None
    if args.phase in ("all", "3"):
        if revisions is None:
            print("Need phase 2 output to run phase 3."); sys.exit(1)
        pdf_urls = phase3(revisions, workers=args.workers,
                          with_operator_manuals=args.with_operator_manuals)
        report["phase3_pairs"] = len(pdf_urls)
    elif os.path.exists(OUT_PDF_URLS):
        pdf_urls = json.load(open(OUT_PDF_URLS, encoding="utf-8"))

    if args.phase in ("all", "4"):
        if pdf_urls is None:
            print("Need phase 3 output to run phase 4."); sys.exit(1)
        dl = phase4(pdf_urls, workers=args.workers,
                    with_operator_manuals=args.with_operator_manuals)
        report["phase4_download"] = dl

    report["elapsed_seconds"] = time.time() - t0
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n=== DONE === Wrote {REPORT}")


if __name__ == "__main__":
    main()
