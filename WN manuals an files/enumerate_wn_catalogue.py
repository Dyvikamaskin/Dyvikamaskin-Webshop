"""
Walk shop.wackerneuson.com and write a manifest of every machine + its
available parts/operating manuals.

Usage:
  python enumerate_wn_catalogue.py [--out wn_catalogue.json] [--delay 0.3]
                                   [--limit N] [--root-category 10]

Output JSON shape:
  {
    "fetched_at": "<ISO>",
    "machines": [
      {
        "code": "5100004399",
        "name": "DPU6555Hec US",
        "category_path": ["Plates", "Reversible", ...],
        "revision_tried": 100,
        "parts_manuals": [{"filename": "...", "size": 1234, "url": "/medias/..."}],
        "operating_manuals": [...],
        "error": null
      },
      ...
    ]
  }
"""
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")

HOST = "https://shop.wackerneuson.com"
CAT_URL = HOST + "/ws/v2/amd/navigation/categories/{cat}?lang=en_US&mode=unrestricted"
DETAILS_URL = HOST + "/ws/v2/amd/machine/details/{code}/revision/{rev}?lang=en_US&mode=unrestricted"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def http_json(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": HOST + "/eparts/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def walk_categories(root_id, delay):
    """Yield (machine_dict, category_path) for every product in the tree."""
    stack = [(root_id, [])]
    seen_cats = set()
    while stack:
        cat_id, path = stack.pop()
        if cat_id in seen_cats:
            continue
        seen_cats.add(cat_id)
        try:
            data = http_json(CAT_URL.format(cat=cat_id))
        except Exception as e:
            print(f"  ! category {cat_id} failed: {e}", file=sys.stderr)
            continue
        time.sleep(delay)

        name = data.get("name") or data.get("title") or str(cat_id)
        here = path + [name] if cat_id != root_id else path

        for product in data.get("products") or []:
            code = product.get("code") or product.get("id")
            pname = product.get("name") or product.get("title") or ""
            if code:
                yield {"code": str(code), "name": pname, "category_path": here}

        for sub in data.get("subcategories") or []:
            sub_id = sub.get("id") or sub.get("code")
            if sub_id is not None:
                stack.append((sub_id, here))


def fetch_machine(code, revisions=(100, 200, 300), delay=0.3):
    last_err = None
    for rev in revisions:
        try:
            data = http_json(DETAILS_URL.format(code=code, rev=rev))
            time.sleep(delay)
            return rev, data, None
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code} on revision {rev}"
            if e.code == 404:
                continue
            return rev, None, last_err
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            return rev, None, last_err
    return None, None, last_err or "no revision matched"


def normalize_manuals(items):
    out = []
    for it in items or []:
        out.append({
            "filename": it.get("filename") or it.get("name"),
            "size": it.get("size"),
            "mime": it.get("mime"),
            "url": it.get("url"),
            "languages": it.get("languages") or it.get("language"),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wn_catalogue.json")
    ap.add_argument("--delay", type=float, default=0.3,
                    help="seconds between requests")
    ap.add_argument("--limit", type=int, default=None,
                    help="stop after N machines (for testing)")
    ap.add_argument("--root-category", type=int, default=10)
    args = ap.parse_args()

    print(f"Walking category tree from id={args.root_category} ...", flush=True)
    machines = list(walk_categories(args.root_category, args.delay))
    # Deduplicate by code (some machines surface under multiple categories).
    seen = {}
    for m in machines:
        if m["code"] not in seen:
            seen[m["code"]] = m
    machines = list(seen.values())
    print(f"Discovered {len(machines)} unique machine codes.", flush=True)

    if args.limit:
        machines = machines[: args.limit]
        print(f"Limiting to first {len(machines)} for this run.", flush=True)

    results = []
    parts_total = 0
    with_parts = 0
    for i, m in enumerate(machines, 1):
        rev, data, err = fetch_machine(m["code"], delay=args.delay)
        entry = {
            "code": m["code"],
            "name": m["name"],
            "category_path": m["category_path"],
            "revision_tried": rev,
            "parts_manuals": [],
            "operating_manuals": [],
            "error": err,
        }
        if data:
            entry["parts_manuals"] = normalize_manuals(data.get("partsManuals"))
            entry["operating_manuals"] = normalize_manuals(data.get("operatingManuals"))
            if entry["parts_manuals"]:
                with_parts += 1
                parts_total += len(entry["parts_manuals"])
        results.append(entry)
        if i % 25 == 0 or i == len(machines):
            print(f"  [{i}/{len(machines)}] {m['code']} {m['name'][:40]:40} "
                  f"parts={len(entry['parts_manuals'])} err={err or '-'}",
                  flush=True)

    manifest = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "root_category": args.root_category,
        "machine_count": len(results),
        "machines_with_parts_books": with_parts,
        "parts_book_count": parts_total,
        "machines": results,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {args.out}")
    print(f"  machines:            {len(results)}")
    print(f"  with parts books:    {with_parts}")
    print(f"  total parts manuals: {parts_total}")


if __name__ == "__main__":
    main()
