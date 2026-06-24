"""
Pull the full eParts dataset from shop.wackerneuson.com.

For every machine in wn_catalogue.json that has at least one revision in
the products endpoint, fetches:

  1. /ws/v2/amd/navigation/products/{machine_code}
       → revisions[] + devices[] per revision + subRevisions[] (engine etc.)
  2. for every component (top-level device or sub-revision device):
     /ws/v2/amd/navigation/components/machine/{code}/revision/{rev}/component/{subProductCode}
       → componentParts[] + diagramData (image + .hd3 click coords)

Writes one JSON per machine to `eparts/{machine_code}.json`. Resumable:
files already on disk are skipped unless --force.

Usage:
  python enumerate_wn_eparts_full.py [--out-dir eparts] [--delay 0.3]
                                     [--limit N] [--force] [--codes CODE [CODE ...]]
"""
import os
import sys
import json
import time
import ssl
import argparse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import certifi

sys.stdout.reconfigure(encoding="utf-8")

HOST = "https://shop.wackerneuson.com"
PRODUCT_URL = HOST + "/ws/v2/amd/navigation/products/{code}?lang=en_US&mode=unrestricted"
COMPONENT_URL = (HOST + "/ws/v2/amd/navigation/components/machine/{code}"
                 "/revision/{rev}/component/{comp}?lang=en_US&mode=unrestricted")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context(cafile=certifi.where())


def api_get(url, retries=3, timeout=25):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json",
                "Referer": HOST + "/eparts/",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # component might be gone for some revs
            last_err = e
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
        wait = 2 ** attempt
        time.sleep(wait)
    raise RuntimeError(f"{url} failed after {retries}: {last_err}")


def normalize_component(comp):
    """Strip noise + flatten."""
    if comp is None:
        return None
    return {
        "code": comp.get("code"),
        "revision": comp.get("revision"),
        "parts": comp.get("componentParts") or [],
        "diagram": comp.get("diagramData"),
    }


def fetch_machine(machine_code, machine_name, category_path, executor, machine_cache):
    """Fetch every component URL exactly once. The server's response to
    /revision/{rev}/component/{spc} depends on {rev} even when the device's
    revisionLevel field is unchanged, so we must NOT collapse across revs."""
    prod = api_get(PRODUCT_URL.format(code=machine_code))
    if prod is None:
        return {"machine_code": machine_code, "machine_name": machine_name,
                "category_path": category_path, "revisions": [],
                "skipped_reason": "product endpoint 404"}

    refs_by_url = {}   # url → True (the dedup is at the URL level)

    def dev_ref(parent_code, rev_num, dev, parent_kind, parent_name=None):
        spc = dev.get("subProductCode")
        rlvl = dev.get("revisionLevel") or ""
        sub_code = dev.get("code") or parent_code
        url = COMPONENT_URL.format(code=sub_code, rev=rev_num, comp=spc)
        refs_by_url[url] = True
        return {
            "name": dev.get("name"),
            "position": dev.get("position"),
            "sub_product_code": spc,
            "revision_level": rlvl,
            "sub_machine_code": sub_code if parent_kind == "sub" else None,
            "_cache_url": url,
        }

    out_revs = []
    for rev in prod.get("revisions") or []:
        rev_num = rev["revision"]
        components = [dev_ref(machine_code, rev_num, d, "top") for d in (rev.get("devices") or [])]
        sub_revs = []
        for sub in rev.get("subRevisions") or []:
            sub_devs = [dev_ref(machine_code, rev_num, d, "sub", sub.get("name"))
                        for d in (sub.get("devices") or [])]
            sub_revs.append({"name": sub.get("name"), "devices": sub_devs})
        out_revs.append({
            "revision": rev_num,
            "name": rev.get("name"),
            "has_bom_tree": rev.get("hasBomTree"),
            "components": components,
            "sub_revisions": sub_revs,
        })

    # Fetch every unique URL in parallel.
    urls = list(refs_by_url.keys())
    api_calls = len(urls)
    results = list(executor.map(api_get, urls)) if urls else []
    url_to_data = {u: normalize_component(r) for u, r in zip(urls, results)}

    # Stitch the cached component data back into each device entry.
    def attach(devs):
        for d in devs:
            d["component"] = url_to_data[d.pop("_cache_url")]
            if d["sub_machine_code"] is None:
                d.pop("sub_machine_code")

    for rev in out_revs:
        attach(rev["components"])
        for sub in rev["sub_revisions"]:
            attach(sub["devices"])

    return {
        "machine_code": machine_code,
        "machine_name": machine_name,
        "category_path": category_path,
        "revisions": out_revs,
        "api_calls": api_calls,
        "unique_urls": len(refs_by_url),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalogue", default="wn_catalogue.json")
    ap.add_argument("--out-dir", default="eparts")
    ap.add_argument("--workers", type=int, default=6,
                    help="concurrent HTTP fetches per machine")
    ap.add_argument("--limit", type=int, default=None,
                    help="stop after N machines (debug)")
    ap.add_argument("--force", action="store_true",
                    help="re-fetch even if file already exists")
    ap.add_argument("--codes", nargs="+", default=None,
                    help="machine codes to fetch (subset, for testing)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    with open(args.catalogue, encoding="utf-8") as f:
        cat = json.load(f)
    machines = cat["machines"]
    if args.codes:
        wanted = set(args.codes)
        machines = [m for m in machines if m["code"] in wanted]

    total_machines = 0
    total_skipped = 0
    total_api_calls = 0
    started = time.time()
    executor = ThreadPoolExecutor(max_workers=args.workers)

    for i, m in enumerate(machines, 1):
        if args.limit and total_machines >= args.limit:
            print(f"--limit reached ({args.limit}); stopping.")
            break
        code = m["code"]
        out_path = os.path.join(args.out_dir, f"{code}.json")
        if not args.force and os.path.exists(out_path) and os.path.getsize(out_path) > 50:
            total_skipped += 1
            continue

        try:
            result = fetch_machine(code, m["name"], m.get("category_path") or [],
                                   executor, machine_cache={})
        except Exception as e:
            print(f"  ! {code} ({m['name']}): {e}", file=sys.stderr, flush=True)
            result = {"machine_code": code, "machine_name": m["name"],
                      "category_path": m.get("category_path"),
                      "error": str(e), "revisions": []}

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        total_machines += 1
        total_api_calls += result.get("api_calls", 0)

        if i % 5 == 0 or i == len(machines) or result.get("api_calls", 0) > 50:
            elapsed = time.time() - started
            n_revs = len(result.get("revisions") or [])
            print(f"  [{i}/{len(machines)}] {code} {m['name'][:38]:38} "
                  f"revs={n_revs} api={result.get('api_calls', 0):>3} "
                  f"total_api={total_api_calls} ({elapsed/60:.1f} min)", flush=True)
    executor.shutdown(wait=False)

    elapsed = time.time() - started
    print()
    print(f"Done. {total_machines} machines written, {total_skipped} skipped (already on disk).")
    print(f"Total API calls: {total_api_calls}")
    print(f"Elapsed: {elapsed/60:.1f} min")


if __name__ == "__main__":
    main()
