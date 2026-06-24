"""
Two tasks:

1. Dump the 80 'truly unknown' 5xxx stocked SKUs with their inventory row context
   (Beskrivelse / ItemDescription / Kategori / Leverandør) so we can pattern-spot
   what model families they belong to.

2. Reverse-engineer the 'Fits Model' / 'Compatibility & Fitment' block on
   danseusa.com and stores.dhsequipmentparts.com (DHS) by fetching two example
   URLs and extracting the surrounding HTML structure.

Saves outputs for downstream extractor design:
   unknowns_5xxx.csv          — the 80 SKUs + inventory context
   fitment_recon_danseusa.html / .json
   fitment_recon_dhs.html / .json
"""
import csv
import json
import os
import re
import ssl
import sys
import urllib.request
from collections import Counter, defaultdict

import certifi
import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CTX = ssl.create_default_context(cafile=certifi.where())
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/126.0 Safari/537.36")

INV_PATH = r"C:\Users\Public\Documents\Inventory DM-WN.xlsx"


# ============================================================
# Task 1 — the 80 truly-unknown 5xxx stocked SKUs
# ============================================================
print("=" * 60)
print("TASK 1: 80 unknown 5xxx stocked SKUs — inventory context")
print("=" * 60)

# Reload the inventory rich (we need the descriptive columns)
wb = openpyxl.load_workbook(INV_PATH, read_only=True, data_only=True)
ws = wb["Vareopptellingskladder"]
rows = list(ws.iter_rows(values_only=True))
header = [str(c).strip() if c is not None else "" for c in rows[0]]
print(f"Inventory header: {header}")
data = rows[1:]

# Read the breakdown to get the 'no source anywhere' set
breakdown = json.load(open(os.path.join(HERE, "inventory_oem_source_breakdown.json"), encoding="utf-8"))
# We have only the first 20 stored; need to recompute the full 240 set
# by reading inventory_matched.csv and filtering to in_oem='' + in_union='' + in_weidemann_sample=''
no_source = set()
sku_to_rows = defaultdict(list)
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        toks = [t.strip() for t in (r["wacker_skus_found"] or "").split(";") if t.strip()]
        for t in toks:
            sku_to_rows[t].append(r)
        if not r["in_oem"] and not r["in_union"] and not r["in_weidemann_sample"]:
            for t in toks:
                no_source.add(t)

# Filter to 5xxx-shape stocked unknowns
unknown_5xxx = sorted([s for s in no_source if re.fullmatch(r"5\d{9}", s)])
print(f"\nFound {len(unknown_5xxx):,} unknown 5xxx SKUs")

# Build full inventory row lookup so we can grab descriptions
# Header columns: Bunkenavn, Varenr, Varenr. 2, Beskrivelse, Antall,
#                 ItemDescription, Leverandør, Kategori
row_by_varenr = {}
for row in data:
    if row[1]:
        row_by_varenr[str(row[1]).strip()] = row

# For each unknown 5xxx, find the inventory rows that reference it
with open(os.path.join(HERE, "unknowns_5xxx.csv"), "w", encoding="utf-8", newline="") as out:
    w = csv.writer(out)
    w.writerow(["sku_5xxx", "primary_varenr", "Bunkenavn", "Beskrivelse",
                "Antall", "ItemDescription", "Leverandør", "Kategori"])
    for sku in unknown_5xxx:
        for matched_row in sku_to_rows[sku]:
            primary = matched_row["primary_sku"]
            inv_row = row_by_varenr.get(primary)
            if inv_row:
                w.writerow([sku, primary,
                            inv_row[0], inv_row[3], inv_row[4],
                            inv_row[5], inv_row[6], inv_row[7]])
print(f"Wrote unknowns_5xxx.csv ({len(unknown_5xxx)} SKUs)")

# Quick category histogram so the user can see patterns at a glance
cat_counter = Counter()
sup_counter = Counter()
sample_descs = []
for sku in unknown_5xxx:
    for matched_row in sku_to_rows[sku]:
        primary = matched_row["primary_sku"]
        inv_row = row_by_varenr.get(primary)
        if not inv_row: continue
        cat_counter[str(inv_row[7] or "").strip()] += 1
        sup_counter[str(inv_row[6] or "").strip()] += 1
        if len(sample_descs) < 25:
            sample_descs.append((sku, str(inv_row[3] or "")[:80]))

print("\nCategory (Kategori) distribution of unknowns:")
for cat, n in cat_counter.most_common(15):
    print(f"  {n:>3,}  {cat!r}")
print("\nSupplier (Leverandør) distribution:")
for sup, n in sup_counter.most_common(15):
    print(f"  {n:>3,}  {sup!r}")
print(f"\nSample descriptions (first 25):")
for sku, desc in sample_descs:
    print(f"  {sku}  {desc!r}")


# ============================================================
# Task 2 — Recon the 'Fits Model' block on danseusa + DHS
# ============================================================
print("\n" + "=" * 60)
print("TASK 2: Recon retailer fitment blocks")
print("=" * 60)

URLS = {
    "danseusa": "https://www.danseusa.com/products/fuel-tank-for-wacker-neuson-wp1550a-plate-compactors-0110765-5000110765",
    "dhs":      "https://stores.dhsequipmentparts.com/wacker-wp1540-wp1550-exciter-shaft-0110185-5000110185/",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        return r.read().decode("utf-8", errors="replace")


def extract_block_around(html: str, anchors: list[str], window: int = 800) -> list[dict]:
    """Find each anchor (case-insensitive), capture surrounding HTML window."""
    out = []
    lower = html.lower()
    for a in anchors:
        i = lower.find(a.lower())
        while i != -1:
            start = max(0, i - 200)
            end = min(len(html), i + window)
            out.append({"anchor": a, "snippet": html[start:end]})
            i = lower.find(a.lower(), i + 1)
            if len(out) > 5: break
    return out


for name, url in URLS.items():
    print(f"\n--- {name}: {url}")
    try:
        html = fetch(url)
    except Exception as e:
        print(f"  fetch failed: {e}")
        continue
    raw_path = os.path.join(HERE, f"fitment_recon_{name}.html")
    with open(raw_path, "w", encoding="utf-8") as f: f.write(html)
    print(f"  Saved raw HTML ({len(html):,} bytes) -> {raw_path}")

    # Look for fitment-shaped blocks
    anchors = [
        "Fits Model", "Fits:", "Fitment", "Compatibility",
        "Compatible With", "Compatible Models", "Models:",
        "Replaces:", "OEM Replaces", "Fits the following",
        "fits-model", "compat-table",
        "WP1540", "WP1550", "Plate Compactor", "Rammer",
    ]
    hits = extract_block_around(html, anchors, window=600)
    found = {}
    for h in hits:
        found.setdefault(h["anchor"], []).append(h["snippet"][:400])
    print(f"  Found anchors: {sorted(found.keys())}")

    # Heuristic: look for explicit fitment <table> / <ul> with Wacker model patterns
    model_pat = re.compile(
        r"\b(WP\d{3,4}A?|WM\d{2,4}|BS\d{2,4}|BPU\d{4}|VP\d{4}|VPG\d{3,4}|"
        r"RD\d{2,4}|RT\d{2,4}|RC\d{2,4}|DPU\d{4,5}|BPS\d{4}|DT\d{2}|"
        r"WS\d{2,4}|G\d{2,3}|EH\d{1,3}|PT\d{1,3})\b"
    )
    models_in_page = sorted(set(model_pat.findall(html.upper())))
    print(f"  Wacker model codes detected in page: {len(models_in_page)} "
          f"(first 15: {models_in_page[:15]})")

    # Look for structured fitment containers
    container_patterns = [
        (r'<div[^>]*(?:class|id)="[^"]*(?:compat|fitment|fits|model)[^"]*"[^>]*>([\s\S]*?)</div>', "div.compat*"),
        (r'<table[^>]*(?:class|id)="[^"]*(?:compat|fitment|fits|model)[^"]*"[^>]*>([\s\S]*?)</table>', "table.compat*"),
        (r'<section[^>]*(?:class|id)="[^"]*(?:compat|fitment|fits|model)[^"]*"[^>]*>([\s\S]*?)</section>', "section.compat*"),
        (r'<dt[^>]*>\s*(?:Fits|Compatibility|Models?)[^<]*</dt>\s*<dd[^>]*>([\s\S]*?)</dd>', "dt/dd"),
        (r'(?:Fits Model[s]?|Compatibility & Fitment)[^<]*:?\s*</?[^>]+>([\s\S]{0,1500})', "label-then-content"),
    ]
    container_hits = {}
    for pat, label in container_patterns:
        m = re.findall(pat, html, re.I)
        if m:
            container_hits[label] = [s[:400] for s in m[:3]]
    print(f"  Structured-container hits: {sorted(container_hits.keys())}")

    # Look for JSON-LD that might encode compatibility
    jsonld = re.findall(r'<script[^>]*application/ld\+json[^>]*>([\s\S]*?)</script>', html, re.I)
    print(f"  JSON-LD blocks: {len(jsonld)}")

    recon = {
        "url": url,
        "html_bytes": len(html),
        "anchors_found": sorted(found.keys()),
        "model_codes_detected": models_in_page,
        "container_hits": container_hits,
        "first_jsonld": jsonld[0][:1500] if jsonld else None,
    }
    json_path = os.path.join(HERE, f"fitment_recon_{name}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(recon, f, ensure_ascii=False, indent=2)
    print(f"  Saved {json_path}")

print("\n=== DONE ===")
print("Next steps:")
print("  - Open unknowns_5xxx.csv to pattern-spot model families")
print("  - Open fitment_recon_*.json to design the fitment extractor")
