"""
Split the 2,371 inventory SKUs by OEM source coverage:
  - in_eparts_only:  only the shop.wackerneuson.com eParts API has it
  - in_pdfs_only:    only one of the 313 successfully-extracted PDFs has it
  - in_both:         both sources have it
  - in_neither:      not in our OEM catalog at all (yet)
Then by SKU shape (5xxx / 1xxx / 0xxx legacy), so we can see how the gap
splits between Wacker construction vs Weidemann/Kramer.
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))


def shape(s):
    if re.fullmatch(r"\d{7}", s):  return "07d_legacy"
    if re.fullmatch(r"\d{10}", s): return f"10d_{s[0]}xxx"
    return "other"


# 1. Inventory SKUs
inv = set()
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if t: inv.add(t)
print(f"Inventory SKUs: {len(inv):,}")

# 2. Build partNumber → set(sources) map from the dumped MCP result
src = os.path.join(HERE, "oem_part_sources.txt")
raw = open(src, encoding="utf-8").read()
# Rows look like {\"partNumber\":\"...\",\"source\":\"EPARTS_API\"}
pairs = re.findall(r'\\"partNumber\\":\\"([^"\\]+)\\",\\"source\\":\\"([^"\\]+)\\"', raw)
print(f"OemPart→source rows: {len(pairs):,}")
oem = defaultdict(set)
for pn, src_label in pairs:
    oem[pn].add(src_label)
print(f"  distinct partNumbers: {len(oem):,}")
src_counts = Counter(s for ss in oem.values() for s in ss)
print(f"  by source: {dict(src_counts)}")

# 3. Bucket inventory SKUs by which sources have them
buckets = {
    "eparts_only": set(),
    "pdf_only":    set(),
    "both":        set(),
    "neither":     set(),
}
for sku in inv:
    srcs = oem.get(sku, set())
    if not srcs:
        buckets["neither"].add(sku)
    elif srcs == {"EPARTS_API"}:
        buckets["eparts_only"].add(sku)
    elif srcs == {"PDF"}:
        buckets["pdf_only"].add(sku)
    else:
        buckets["both"].add(sku)

print(f"\n=== Inventory ({len(inv):,}) split by OEM source coverage ===")
for b, s in buckets.items():
    print(f"  {b:<14s} {len(s):>5,}  ({100*len(s)/len(inv):.1f}%)")

# 4. Per-shape breakdown of each bucket
print(f"\n=== Same split by SKU shape ===")
print(f"{'bucket':<14s}  {'07d_legacy':>10}  {'10d_1xxx':>9}  {'10d_5xxx':>9}  {'other':>6}")
for b, s in buckets.items():
    shp = Counter(shape(x) for x in s)
    print(f"  {b:<12s}  {shp.get('07d_legacy', 0):>10,}  "
          f"{shp.get('10d_1xxx', 0):>9,}  {shp.get('10d_5xxx', 0):>9,}  "
          f"{shp.get('other', 0):>6,}")

# 5. The "potentially addressable" view
#    For each bucket, how many also have a retailer listing?
import csv as _csv
inv_tags = {}
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in _csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if not t: continue
            inv_tags[t] = {
                "in_oem":   r["in_oem"] == "Y",
                "in_union": r["in_union"] == "Y",
                "in_weidemann_sample": r["in_weidemann_sample"] == "Y",
                "in_neyer_45k": r["in_neyer_45k"] == "Y",
            }

print(f"\n=== 'Neither' bucket ({len(buckets['neither']):,}) — where else can we find them? ===")
neither = buckets["neither"]
in_union = {s for s in neither if inv_tags.get(s, {}).get("in_union")}
in_neyer = {s for s in neither if inv_tags.get(s, {}).get("in_neyer_45k")}
in_weid  = {s for s in neither if inv_tags.get(s, {}).get("in_weidemann_sample")}
no_source = neither - in_union - in_weid
print(f"  in retailer union (price exists): {len(in_union):,}")
print(f"    of which in Neyer (Weidemann/Kramer): {len(in_neyer):,}")
print(f"  in Weidemann cat-3 sample:        {len(in_weid):,}")
print(f"  in NO source we know:              {len(no_source):,}")

# Shape of the truly unknown
print(f"\nShape of 'no source anywhere' ({len(no_source):,}):")
for shp, n in Counter(shape(s) for s in no_source).most_common():
    print(f"  {shp:<15s} {n:>5,}")

# Save buckets for the user
out = {
    "inventory_size": len(inv),
    "buckets": {k: len(v) for k, v in buckets.items()},
    "neither_breakdown": {
        "has_retailer_price": len(in_union),
        "of_which_in_neyer":  len(in_neyer),
        "has_weidemann_sample_match": len(in_weid),
        "truly_unknown": len(no_source),
    },
    "no_source_first_20": sorted(no_source)[:20],
}
with open(os.path.join(HERE, "inventory_oem_source_breakdown.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nWrote inventory_oem_source_breakdown.json")
