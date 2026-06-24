"""
Systematically walk the 96 big-equipment machines (Excavators, Wheel Loaders,
Skid Steer, Telehandlers, Dumpers, Attachments) through the eParts
non-revision API endpoints discovered today (24 June):

  1. /navigation/nonRevMachine/{code}  → sparepartsBookList[{name, code, url}]
  2. /machine/details/{code}/sparepartbook/{bookId}  → operatingManuals[] + partsManuals[] + imageUrl
  3. /navigation/sparepartsBookList/{bookId}  → (currently empty for all tested, but capture anyway)

Goal: empirically know which big-equipment machines have ANY data exposed
(parts manual PDF, BOM dropdown, operating manuals) vs which are stub-only.

Output: eparts_bigequip_books.json
"""
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import certifi

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CTX = ssl.create_default_context(cafile=certifi.where())
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/126.0 Safari/537.36")
BASE = "https://shop.wackerneuson.com"
WS = f"{BASE}/ws/v2/amd"


def fetch_json(url, retries=4, timeout=30):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "application/json,*/*",
                "Referer": f"{BASE}/eparts/",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return r.status, json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 410): return e.code, None
            last_err = e
            wait = 2.0 * (2 ** attempt)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = 1.0 * (2 ** attempt)
        if attempt == retries - 1: break
        time.sleep(min(wait, 30))
    raise RuntimeError(f"{type(last_err).__name__}: {url}")


# Big-equipment categories to walk
BIG_EQUIP_CATS = {
    "Excavators", "Wheel Loaders", "Telescopic Wheel Loaders",
    "Skid Steer Loaders", "Telehandlers", "Dumpers", "Attachments",
    "Backhoe Loaders",
}

# Load full machine list, filter to big equipment
machines = json.load(open(os.path.join(HERE, "eparts_all_machines.json"), encoding="utf-8"))
big = [m for m in machines
       if any(c in m.get("category_path", "") for c in BIG_EQUIP_CATS)]
print(f"Big-equipment machines to walk: {len(big):,}")


def walk_one(machine):
    code = machine["code"]; name = machine["name"]
    out = {"code": code, "name": name,
           "category_path": machine.get("category_path"),
           "nonRevMachine": None, "books": []}
    try:
        st, data = fetch_json(f"{WS}/navigation/nonRevMachine/{code}?lang=en_US&mode=unrestricted")
        out["nonRevMachine_status"] = st
        out["nonRevMachine"] = data
        if data and data.get("sparepartsBookList"):
            for book in data["sparepartsBookList"]:
                book_id = book.get("code")
                if not book_id: continue
                try:
                    st2, det = fetch_json(f"{WS}/machine/details/{code}/sparepartbook/{book_id}?lang=en_US&mode=unrestricted")
                    pm = (det or {}).get("partsManuals", []) or []
                    om = (det or {}).get("operatingManuals", []) or []
                    out["books"].append({
                        "book_id": book_id, "book_name": book.get("name"),
                        "details_status": st2,
                        "n_parts_manuals": len(pm),
                        "n_operating_manuals": len(om),
                        "image_url": (det or {}).get("imageUrl"),
                        "product_name": (det or {}).get("productName"),
                        "parts_manuals": pm,
                        "operating_manuals_filenames": [m.get("filename") for m in om],
                    })
                except Exception as e:
                    out["books"].append({"book_id": book_id, "error": str(e)[:160]})
                try:
                    st3, lst = fetch_json(f"{WS}/navigation/sparepartsBookList/{book_id}?lang=en_US&mode=unrestricted")
                    out["books"][-1]["bookList_status"] = st3
                    out["books"][-1]["bookList_payload"] = lst
                except Exception as e:
                    out["books"][-1]["bookList_error"] = str(e)[:160]
    except Exception as e:
        out["error"] = str(e)[:160]
    return out


results = []
started = time.time()
with ThreadPoolExecutor(max_workers=4) as ex:
    futures = {ex.submit(walk_one, m): m for m in big}
    for i, fut in enumerate(as_completed(futures), 1):
        try:
            results.append(fut.result())
        except Exception as e:
            print(f"  ! {futures[fut]['code']}: {e}", flush=True)
        if i % 10 == 0 or i == len(big):
            print(f"  [{i:>3}/{len(big)}] {(time.time()-started):.0f}s", flush=True)

with open(os.path.join(HERE, "eparts_bigequip_books.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

# Summary
from collections import Counter
n_with_books = sum(1 for r in results if r.get("books"))
n_with_parts_manuals = sum(1 for r in results if any(b.get("n_parts_manuals", 0) > 0 for b in r.get("books", [])))
n_with_operating = sum(1 for r in results if any(b.get("n_operating_manuals", 0) > 0 for b in r.get("books", [])))
by_cat = Counter()
by_cat_with_books = Counter()
by_cat_with_pm = Counter()
for r in results:
    cp = r.get("category_path", "")
    top = next((c for c in BIG_EQUIP_CATS if c in cp), "Other")
    by_cat[top] += 1
    if r.get("books"): by_cat_with_books[top] += 1
    if any(b.get("n_parts_manuals", 0) > 0 for b in r.get("books", [])):
        by_cat_with_pm[top] += 1

print(f"\n=== Big-equipment walk summary ===")
print(f"  Machines walked:               {len(results):,}")
print(f"  With ≥1 spare parts book:      {n_with_books:,}")
print(f"  With ≥1 parts MANUAL (PDF):    {n_with_parts_manuals:,}")
print(f"  With ≥1 operating manual:      {n_with_operating:,}")
print()
print(f"{'Category':<28s} {'machines':>8} {'w/ books':>9} {'w/ parts manual':>16}")
for cat in sorted(by_cat, key=lambda c: -by_cat[c]):
    print(f"  {cat:<26s} {by_cat[cat]:>8} {by_cat_with_books[cat]:>9} {by_cat_with_pm[cat]:>16}")
print(f"\nWrote eparts_bigequip_books.json")
