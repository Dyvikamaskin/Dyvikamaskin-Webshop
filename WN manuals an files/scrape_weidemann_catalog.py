"""
Scrape the Weidemann dealer catalog (Docware CatalogCreator) at
service.weidemann.de.

Strategy per catalog (18 total):
  1. POST/GET /action.php?func=load&catalog=N to set session's current catalog
  2. Walk printAssembly?id=1, 2, 3, ... incrementally
  3. Each response is either:
       - a BRANCH: HTML <table> with rows linking to sub-assemblies via goTo(cat, id)
       - a LEAF: HTML <table> with rows of OEM parts (Article no., Description, Qty, Selling Unit)
  4. Stop a catalog when:
       - response equals the catalog overview (no per-assembly content), OR
       - N consecutive 404s / empty responses

Outputs:
  weidemann_assemblies.jsonl  — one assembly per line (branch or leaf)
  weidemann_parts.csv         — flat parts table (one part row per leaf row)
  weidemann_report.json       — counts, per-catalog stats

Uses the live browser session — pass cookie + token via env or args.

Usage:
  python scrape_weidemann_catalog.py \\
      --cookie 'PHPSESSID=...' --tok 'abc123...' \\
      --catalogs 0,1,2,3 --max-id 5000
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

import certifi

sys.stdout.reconfigure(encoding="utf-8")
CTX = ssl.create_default_context(cafile=certifi.where())
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
BASE = "https://service.weidemann.de/catalogcreator/template"

# Regex to detect a branch row: has goTo(cat, id) link to a sub-assembly
BRANCH_ROW_RE = re.compile(
    r'<tr[^>]*id="tr_\d+_(\d+)"[^>]*>'
    r'.*?<td class="tbody td_itemnumber[^"]*">([^<]*)</td>'
    r'.*?<span\s+onclick="[^"]*goTo\((\d+),\s*(\d+)[^)]*\)[^"]*"[^>]*>([^<]+)</span>'
    r'.*?<td class="tbody td_PRICEQ[^"]*">([^<]*)</td>'
    r'.*?<td class="tbody td_PRICESU[^"]*">([^<]*)</td>',
    re.S,
)
# Regex to detect a leaf row: 10-digit Article no. + description
LEAF_ROW_RE = re.compile(
    r'<tr[^>]*id="tr_\d+_\d+"[^>]*>'
    r'.*?<td class="tbody td_itemnumber[^"]*">([^<]*)</td>'
    r'.*?<td class="tbody td_partnumber[^"]*"[^>]*>([^<]*)</td>'
    r'.*?<td class="tbody td_partname[^"]*"[^>]*>([\s\S]*?)</td>'
    r'(?:.*?<td class="tbody td_REMARK[^"]*">([\s\S]*?)</td>)?'
    r'.*?<td class="tbody td_PRICEQ[^"]*">([^<]*)</td>'
    r'.*?<td class="tbody td_PRICESU[^"]*">([^<]*)</td>',
    re.S,
)
TITLE_RE = re.compile(r'<div class="areaHeader" id="contHeader">[\s\S]*?<div[^>]*id="breadcrumb"[^>]*>([\s\S]*?)</div>([^<]+)<')


def http(url, cookie, retries=3, timeout=30):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Cookie": cookie,
                "Accept": "text/html,*/*;q=0.8",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return r.status, r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, ""
            last_err = e
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
        time.sleep(1.5 ** attempt)
    raise RuntimeError(f"{url}: {last_err}")


def parse_assembly(body):
    """Return dict with keys: title, breadcrumb, kind ('branch'|'leaf'|'overview'),
    rows (list of dicts)."""
    title_m = TITLE_RE.search(body)
    bread, title = "", ""
    if title_m:
        bread = re.sub(r"<[^>]+>", " > ", title_m.group(1)).strip(" > ").replace("  ", " ")
        title = title_m.group(2).strip()

    # Try leaf parse first (parts have 10-digit Article no.)
    leaf_matches = LEAF_ROW_RE.findall(body)
    if leaf_matches:
        rows = []
        for m in leaf_matches:
            item_no, art_no, partname_raw, remark_raw, qty, su = m
            partname = re.sub(r"<[^>]+>", "", partname_raw).strip()
            remark = re.sub(r"<[^>]+>", "", remark_raw or "").strip()
            rows.append({
                "item_no": item_no.strip(),
                "article_no": art_no.strip(),
                "partname": partname,
                "remark": remark,
                "qty": qty.strip(),
                "selling_unit": su.strip(),
            })
        return {"title": title, "breadcrumb": bread, "kind": "leaf", "rows": rows}

    # Otherwise branch
    branch_matches = BRANCH_ROW_RE.findall(body)
    if branch_matches:
        rows = []
        for m in branch_matches:
            tr_idx, item_no, target_cat, target_id, name, qty, su = m
            rows.append({
                "item_no": item_no.strip(),
                "name": name.strip(),
                "target_cat": int(target_cat),
                "target_id": int(target_id),
                "qty": qty.strip(),
                "selling_unit": su.strip(),
            })
        return {"title": title, "breadcrumb": bread, "kind": "branch", "rows": rows}

    return {"title": title, "breadcrumb": bread, "kind": "overview", "rows": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True, help="e.g. 'PHPSESSID=abc123'")
    ap.add_argument("--tok", required=True)
    ap.add_argument("--catalogs", default=",".join(str(i) for i in range(18)),
                    help="comma-separated catalog indices (default 0..17)")
    ap.add_argument("--max-id", type=int, default=10000)
    ap.add_argument("--empty-streak", type=int, default=20,
                    help="stop a catalog after N consecutive 'overview' responses")
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--out-jsonl", default="weidemann_assemblies.jsonl")
    ap.add_argument("--out-csv", default="weidemann_parts.csv")
    ap.add_argument("--report", default="weidemann_report.json")
    args = ap.parse_args()

    catalogs = [int(c) for c in args.catalogs.split(",") if c.strip()]
    print(f"Catalogs to walk: {catalogs}")

    seen = set()
    if os.path.exists(args.out_jsonl):
        with open(args.out_jsonl, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    seen.add((r["catalog"], r["id"]))
                except Exception:
                    pass
        print(f"Resume: {len(seen)} assemblies already in {args.out_jsonl}")

    per_catalog_stats = {}
    overall_started = time.time()
    out_f = open(args.out_jsonl, "a", encoding="utf-8")
    try:
        for cat in catalogs:
            cat_started = time.time()
            print(f"\n=== Catalog {cat} ===", flush=True)
            # Set session to this catalog
            sc, _ = http(f"{BASE}/action.php?func=load&catalog={cat}&cL=en&tok={args.tok}", args.cookie)
            print(f"  /load status={sc}")
            # Walk IDs 1..max-id
            n_branch = n_leaf = n_overview = n_404 = 0
            empty_streak = 0
            for aid in range(1, args.max_id + 1):
                if (cat, aid) in seen:
                    continue
                try:
                    s, body = http(f"{BASE}/action.php?func=printAssembly&id={aid}&highlite=null&tok={args.tok}", args.cookie)
                except Exception as e:
                    print(f"  ! cat={cat} id={aid}: {e}", file=sys.stderr)
                    continue
                if s == 404 or not body:
                    n_404 += 1
                    empty_streak += 1
                else:
                    parsed = parse_assembly(body)
                    parsed["catalog"] = cat
                    parsed["id"] = aid
                    parsed["bytes"] = len(body)
                    if parsed["kind"] == "branch":
                        n_branch += 1
                        empty_streak = 0
                    elif parsed["kind"] == "leaf":
                        n_leaf += 1
                        empty_streak = 0
                    else:
                        n_overview += 1
                        empty_streak += 1
                    out_f.write(json.dumps(parsed, ensure_ascii=False) + "\n")
                if aid % 100 == 0:
                    elapsed = time.time() - cat_started
                    rate = aid / elapsed if elapsed > 0 else 0
                    print(f"  [cat={cat} id={aid}] branch={n_branch} leaf={n_leaf} overview={n_overview} 404={n_404} streak={empty_streak} rate={rate:.1f}/s",
                          flush=True)
                    out_f.flush()
                if empty_streak >= args.empty_streak:
                    print(f"  catalog {cat} exhausted at id={aid} (streak={empty_streak})")
                    break
                time.sleep(args.delay)
            per_catalog_stats[cat] = {
                "branch": n_branch, "leaf": n_leaf, "overview": n_overview, "404": n_404,
                "elapsed_s": round(time.time() - cat_started, 1),
            }
            print(f"  catalog {cat} done: {per_catalog_stats[cat]}")
    finally:
        out_f.close()

    # Emit a flat parts CSV from the JSONL
    print(f"\nEmitting {args.out_csv} ...")
    cols = ["catalog", "id", "breadcrumb", "title", "item_no", "article_no",
            "partname", "remark", "qty", "selling_unit"]
    rows_written = 0
    with open(args.out_jsonl, encoding="utf-8") as src, \
            open(args.out_csv, "w", encoding="utf-8", newline="") as dst:
        w = csv.DictWriter(dst, fieldnames=cols)
        w.writeheader()
        for line in src:
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("kind") != "leaf":
                continue
            for row in r.get("rows", []):
                w.writerow({
                    "catalog": r.get("catalog"),
                    "id": r.get("id"),
                    "breadcrumb": r.get("breadcrumb"),
                    "title": r.get("title"),
                    "item_no": row.get("item_no"),
                    "article_no": row.get("article_no"),
                    "partname": row.get("partname"),
                    "remark": row.get("remark"),
                    "qty": row.get("qty"),
                    "selling_unit": row.get("selling_unit"),
                })
                rows_written += 1
    print(f"Wrote {rows_written} parts rows to {args.out_csv}")

    elapsed_total = time.time() - overall_started
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump({
            "catalogs": per_catalog_stats,
            "elapsed_total_s": round(elapsed_total, 1),
        }, f, ensure_ascii=False, indent=2)
    print(f"Wrote {args.report}")


if __name__ == "__main__":
    main()
