"""
Apply the legacy↔modern SAP cross-reference to the inventory overlap analysis.

For each inventory SKU previously marked as "not in OEM", check if its
legacy equivalent (via the mapping table) IS in the OEM catalog.
If so, we have data for it — just under the old number.
"""
import csv
import json
import os
import re
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# Load mapping
m = json.load(open(os.path.join(HERE, "sku_legacy_modern_map.json"), encoding="utf-8"))
mod2leg = m["modern_to_legacy"]   # modern → [legacies]
leg2mod = m["legacy_to_modern"]   # legacy → [moderns]

# Load OEM partNumbers + per-source breakdown from the dump we already have
src_dump = os.path.join(HERE, "oem_part_sources.txt")
raw = open(src_dump, encoding="utf-8").read()
oem_with_src = {}
for pn, source in re.findall(r'\\"partNumber\\":\\"([^"\\]+)\\",\\"source\\":\\"([^"\\]+)\\"', raw):
    oem_with_src.setdefault(pn, set()).add(source)
print(f"OEM partNumbers (with source tags): {len(oem_with_src):,}")
print(f"  source breakdown: {Counter(s for ss in oem_with_src.values() for s in ss)}")

# Load inventory SKUs + previous bucket assignments
inv_skus = set()
inv_in_oem = set()
inv_in_union = set()
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if not t: continue
            inv_skus.add(t)
            if r["in_oem"] == "Y": inv_in_oem.add(t)
            if r["in_union"] == "Y": inv_in_union.add(t)
print(f"Inventory SKUs: {len(inv_skus):,}, in OEM directly: {len(inv_in_oem):,}")

def shape(s):
    if re.fullmatch(r"\d{7}", s): return "07d"
    if re.fullmatch(r"\d{10}", s): return f"10d_{s[0]}xxx"
    return "other"

# For each inventory SKU NOT in OEM directly, can we resolve via mapping?
gap = inv_skus - inv_in_oem
print(f"\nInventory SKUs not in OEM directly: {len(gap):,}")

resolved_via_legacy = set()
unresolved_after_mapping = set()
for sku in gap:
    if shape(sku).startswith("10d"):
        legs = mod2leg.get(sku, [])
        if any(l in oem_with_src for l in legs):
            resolved_via_legacy.add(sku)
        else:
            unresolved_after_mapping.add(sku)
    elif shape(sku) == "07d":
        # Legacy in inv but not in OEM — check modern
        mods = leg2mod.get(sku, [])
        if any(m in oem_with_src for m in mods):
            resolved_via_legacy.add(sku)
        else:
            unresolved_after_mapping.add(sku)
    else:
        unresolved_after_mapping.add(sku)

print(f"\n=== INVENTORY OEM COVERAGE — WITH MAPPING APPLIED ===")
total = len(inv_skus)
direct = len(inv_in_oem)
via_legacy = len(resolved_via_legacy)
new_total = direct + via_legacy
print(f"  Direct match in OEM:           {direct:>5,}  ({100*direct/total:.1f}%)")
print(f"  +Resolved via legacy mapping:  {via_legacy:>5,}  ({100*via_legacy/total:.1f}%)")
print(f"  = Combined coverage:           {new_total:>5,}  ({100*new_total/total:.1f}%)")
print(f"  Still no OEM (incl. mapped):   {len(unresolved_after_mapping):>5,}  ({100*len(unresolved_after_mapping)/total:.1f}%)")
print(f"  Δ vs before:                   +{via_legacy:,} stocked items now have OEM data through legacy")

# Shape histogram of what's still unresolved
print(f"\nShape of still-unresolved gap:")
for s, n in Counter(shape(x) for x in unresolved_after_mapping).most_common():
    print(f"  {s:<12s} {n:>5,}")

# Same view restricted to the 80 truly-unknown (no retailer either)
unknowns_80 = set()
with open(os.path.join(HERE, "unknowns_5xxx.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        unknowns_80.add(r["sku_5xxx"])
mapped_80 = unknowns_80 & resolved_via_legacy
print(f"\n=== The 80 'truly unknown' subset ===")
print(f"  Resolved via mapping:          {len(mapped_80):>3} / 80")
print(f"  Still nowhere:                 {80 - len(mapped_80):>3} / 80")

# Where did the via-legacy resolution come from? Pull source labels
print(f"\nSource signals behind the {via_legacy:,} via-legacy resolutions:")
src_counter = Counter()
with open(os.path.join(HERE, "sku_legacy_modern_map.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        mod, leg = r["modern"], r["legacy"]
        if mod in resolved_via_legacy or leg in resolved_via_legacy:
            for s in r["sources"].split(";"):
                src_counter[s] += 1
for s, n in src_counter.most_common(10):
    print(f"  {s:<40s} {n:>5,}")

# Persist a small summary
out = {
    "inventory_size": total,
    "in_oem_direct": direct,
    "resolved_via_legacy_mapping": via_legacy,
    "combined_oem_coverage": new_total,
    "combined_coverage_pct": round(100 * new_total / total, 1),
    "remaining_gap": len(unresolved_after_mapping),
    "remaining_gap_shape": dict(Counter(shape(x) for x in unresolved_after_mapping).most_common()),
    "of_80_unknowns_resolved_via_legacy": len(mapped_80),
}
with open(os.path.join(HERE, "inventory_after_mapping_summary.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nWrote inventory_after_mapping_summary.json")
