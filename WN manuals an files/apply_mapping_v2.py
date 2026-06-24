"""
Re-apply the 49,365-pair legacy↔modern map against the LATEST OEM data:
  - eparts/*.json (eParts API, 28,316 modern SKUs)
  - wn_parts.sqlite (PDF source, 35,627 distinct SKUs — 9.7× yesterday's count)

For each uncovered inventory SKU, check whether its legacy equivalent (or
vice-versa) IS in the new combined OEM.
"""
import csv
import json
import os
import re
import sqlite3
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))


def shape(s):
    if re.fullmatch(r"\d{7}", s): return "07d_legacy"
    if re.fullmatch(r"\d{10}", s): return f"10d_{s[0]}xxx"
    return "other"


# Combined OEM from latest data
pdf_skus = set()
con = sqlite3.connect(os.path.join(HERE, "wn_parts.sqlite"))
for row in con.execute("SELECT DISTINCT part_number FROM parts WHERE part_number IS NOT NULL"):
    if row[0]: pdf_skus.add(row[0].strip())
con.close()

eparts_skus = set()
for fname in os.listdir(os.path.join(HERE, "eparts")):
    if not fname.endswith(".json"): continue
    try:
        d = json.load(open(os.path.join(HERE, "eparts", fname), encoding="utf-8"))
    except Exception: continue
    def walk(node):
        if isinstance(node, dict):
            pn = node.get("partNumber")
            if pn:
                pn = str(pn).strip()
                if pn: eparts_skus.add(pn)
            for v in node.values(): walk(v)
        elif isinstance(node, list):
            for v in node: walk(v)
    walk(d)

oem = pdf_skus | eparts_skus
print(f"Combined OEM (PDF + eParts):  {len(oem):,}")

# Mapping
m = json.load(open(os.path.join(HERE, "sku_legacy_modern_map.json"), encoding="utf-8"))
mod2leg = m["modern_to_legacy"]
leg2mod = m["legacy_to_modern"]
print(f"Mapping pairs: {m['n_pairs']:,}, modern→legacy keys: {len(mod2leg):,}")

# Inventory
inv = set()
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if t: inv.add(t)
print(f"Inventory total: {len(inv):,}")

# Apply
direct = inv & oem
gap = inv - oem
print(f"Direct match (no mapping):    {len(direct):,}")
print(f"Gap (before mapping):         {len(gap):,}")

resolved_via_map = set()
for sku in gap:
    if shape(sku) == "07d_legacy":
        # Legacy in inv — check modern in OEM
        mods = leg2mod.get(sku, [])
        if any(m in oem for m in mods):
            resolved_via_map.add(sku)
    elif shape(sku).startswith("10d"):
        legs = mod2leg.get(sku, [])
        if any(l in oem for l in legs):
            resolved_via_map.add(sku)

print(f"+Resolved via legacy↔modern:  {len(resolved_via_map):,}")
print(f"Combined coverage:            {len(direct) + len(resolved_via_map):,}  ({100*(len(direct)+len(resolved_via_map))/len(inv):.1f}%)")
print(f"Remaining gap:                {len(gap) - len(resolved_via_map):,}  ({100*(len(gap)-len(resolved_via_map))/len(inv):.1f}%)")

# Per-shape view
final_gap = gap - resolved_via_map
print(f"\nGap breakdown by shape:")
for shp, n in Counter(shape(s) for s in final_gap).most_common():
    print(f"  {shp:<15s}  {n:>5,}")

# Wacker construction specifically
wn_constr_inv = {s for s in inv if shape(s) in ("10d_5xxx", "07d_legacy")}
wn_constr_covered = (direct | resolved_via_map) & wn_constr_inv
print(f"\nWN construction (5xxx + legacy) only:")
print(f"  Total: {len(wn_constr_inv):,}")
print(f"  Covered (direct + mapping): {len(wn_constr_covered):,}  ({100*len(wn_constr_covered)/len(wn_constr_inv):.1f}%)")
print(f"  Gap: {len(wn_constr_inv) - len(wn_constr_covered):,}")
