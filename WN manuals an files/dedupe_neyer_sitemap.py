"""
Walk Neyer.de's sitemap, collect all /products/wackerneuson-* URLs across
locales, dedupe by handle, compare to existing wn_neyer.csv.

Output:
  neyer_wacker_handles.json — sorted list of unique handles (without locale prefix)
  neyer_sitemap_report.json — stats: total, by-locale, set-diffs vs CSV
"""
import ssl
import sys
import csv
import re
import json
import time
import urllib.request
from collections import Counter

import certifi

sys.stdout.reconfigure(encoding="utf-8")
CTX = ssl.create_default_context(cafile=certifi.where())
UA = "Mozilla/5.0 Chrome/126.0"


def get(url, timeout=30, retries=3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=timeout, context=CTX).read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{url}: {last}")


def main():
    print("Fetching sitemap index ...")
    root = get("https://neyer.de/sitemap.xml")
    sub_sitemaps = [s.replace("&amp;", "&")
                    for s in re.findall(r"<loc>([^<]+sitemap_products_\d+\.xml[^<]*)</loc>", root)]
    print(f"  {len(sub_sitemaps)} product sub-sitemaps")

    handles = set()
    locale_count = Counter()
    t0 = time.time()
    for i, sm in enumerate(sub_sitemaps, 1):
        try:
            body = get(sm)
        except Exception as e:
            print(f"  ! sitemap {i}: {e}", flush=True)
            continue
        for u in re.findall(r"<loc>(https?://[^<]+/products/wackerneuson-[^<]+)</loc>", body):
            m = re.match(r"https?://neyer\.de/([a-z]{2})/products/(wackerneuson-[^?\s]+)$", u)
            if m:
                locale_count[m.group(1)] += 1
                handles.add(m.group(2))
                continue
            m = re.match(r"https?://neyer\.de/products/(wackerneuson-[^?\s]+)$", u)
            if m:
                locale_count["(default)"] += 1
                handles.add(m.group(1))
        if i % 100 == 0 or i == len(sub_sitemaps):
            print(f"  [{i}/{len(sub_sitemaps)}] unique_handles={len(handles):,} ({time.time()-t0:.0f}s)",
                  flush=True)

    print()
    total_urls = sum(locale_count.values())
    print(f"Total Wacker URLs across all locales: {total_urls:,}")
    print(f"By locale: {dict(locale_count)}")
    print(f"Unique Wacker handles: {len(handles):,}")

    csv_handles = set()
    with open("wn_neyer.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            m = re.search(r"/products/(wackerneuson-[^?\s]+)", r["product_url"])
            if m:
                csv_handles.add(m.group(1))
    print(f"CSV handles: {len(csv_handles):,}")

    both = handles & csv_handles
    only_sitemap = handles - csv_handles
    only_csv = csv_handles - handles
    print(f"Both: {len(both):,}")
    print(f"In sitemap, NOT in CSV: {len(only_sitemap):,}")
    print(f"In CSV, NOT in sitemap: {len(only_csv):,}")

    with open("neyer_wacker_handles.json", "w", encoding="utf-8") as f:
        json.dump(sorted(handles), f, ensure_ascii=False, indent=2)
    with open("neyer_sitemap_report.json", "w", encoding="utf-8") as f:
        json.dump({
            "total_urls_all_locales": total_urls,
            "by_locale": dict(locale_count),
            "unique_handles": len(handles),
            "csv_handles": len(csv_handles),
            "in_both": len(both),
            "in_sitemap_only": len(only_sitemap),
            "in_csv_only": len(only_csv),
            "sample_sitemap_only": sorted(only_sitemap)[:20],
        }, f, ensure_ascii=False, indent=2)
    print("Wrote neyer_wacker_handles.json + neyer_sitemap_report.json")


if __name__ == "__main__":
    main()
