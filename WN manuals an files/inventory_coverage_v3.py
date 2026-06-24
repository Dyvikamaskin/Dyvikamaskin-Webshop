"""
Inventory coverage v3 — adds LS Engineers (21,501 SKUs) to the source mix.
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


# Sources
pdf_skus = set()
con = sqlite3.connect(os.path.join(HERE, "wn_parts.sqlite"))
for row in con.execute("SELECT DISTINCT part_number FROM parts WHERE part_number IS NOT NULL"):
    if row[0]: pdf_skus.add(row[0].strip())
con.close()
print(f"PDF SKUs (wn_parts.sqlite):                     {len(pdf_skus):,}")

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
print(f"eParts API SKUs:                                {len(eparts_skus):,}")

# Neyer 45K (sitemap)
neyer = {l.strip() for l in open(os.path.join(HERE, "neyer_skus_all.txt"), encoding="utf-8") if l.strip()}
print(f"Neyer 45K (sitemap):                            {len(neyer):,}")

# LS Engineers
ls = set()
with open(os.path.join(HERE, "lsengineers_wacker_parts.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        s = (r["sku"] or "").strip()
        if s: ls.add(s)
print(f"LS Engineers (sitemap-derived):                 {len(ls):,}")

oem_combined = pdf_skus | eparts_skus
print(f"\nCombined OEM (PDF + eParts):                  {len(oem_combined):,}")
print(f"+ Neyer:                                      {len(oem_combined | neyer):,}")
print(f"+ Neyer + LS Engineers:                       {len(oem_combined | neyer | ls):,}")

# Inventory
inv = set()
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if t: inv.add(t)
print(f"\nInventory SKUs (Wacker shape):                {len(inv):,}")

# Apply mapping
m = json.load(open(os.path.join(HERE, "sku_legacy_modern_map.json"), encoding="utf-8"))
mod2leg = m["modern_to_legacy"]
leg2mod = m["legacy_to_modern"]


def coverage_layered(inv, layers):
    """Each layer adds to the cumulative cover set."""
    cumul = set()
    results = []
    for name, source in layers:
        added = (source & inv) - cumul
        cumul |= (source & inv)
        results.append({"layer": name, "added": len(added), "total": len(cumul)})
    # Mapping pass: for SKUs still uncovered, check if their legacy or modern equivalent is in cumul
    uncovered = inv - cumul
    via_map = set()
    for sku in uncovered:
        if shape(sku) == "07d_legacy":
            mods = leg2mod.get(sku, [])
            if any(m_ in cumul for m_ in mods): via_map.add(sku)
        elif shape(sku).startswith("10d"):
            legs = mod2leg.get(sku, [])
            if any(l_ in cumul for l_ in legs): via_map.add(sku)
    cumul |= via_map
    results.append({"layer": "+ legacy↔modern mapping", "added": len(via_map), "total": len(cumul)})
    return results, cumul, inv - cumul


layers = [
    ("OEM (eParts API + PDFs)", oem_combined),
    ("+ Neyer 45K", neyer),
    ("+ LS Engineers 21.5K", ls),
]
results, covered, still_gap = coverage_layered(inv, layers)

print(f"\n=== Layered inventory coverage ===")
print(f"  {'Layer':<35s} {'+SKUs':>8s} {'cumul':>8s}  {'cumul %':>8s}")
for r in results:
    print(f"  {r['layer']:<35s} {r['added']:>+8,} {r['total']:>8,}  {100*r['total']/len(inv):>7.1f}%")

print(f"\n  Still gap:                          {len(still_gap):>5,}  {100*len(still_gap)/len(inv):.1f}%")

# Per-shape gap breakdown
print(f"\nResidual gap by shape:")
for s, n in Counter(shape(x) for x in still_gap).most_common():
    print(f"  {s:<15s} {n:>5,}")

# Stocked Wacker construction only
wn_inv = {s for s in inv if shape(s) in ("10d_5xxx", "07d_legacy")}
wn_covered = wn_inv & covered
print(f"\n=== WN construction stocked (5xxx + legacy) ===")
print(f"  Total: {len(wn_inv):,}  Covered: {len(wn_covered):,} ({100*len(wn_covered)/len(wn_inv):.1f}%)  Gap: {len(wn_inv - wn_covered):,}")

# 1xxx stocked
wn_1xxx_inv = {s for s in inv if shape(s) == "10d_1xxx"}
wn_1xxx_covered = wn_1xxx_inv & covered
print(f"\n=== 1xxx stocked (big equipment + agri) ===")
print(f"  Total: {len(wn_1xxx_inv):,}  Covered: {len(wn_1xxx_covered):,} ({100*len(wn_1xxx_covered)/len(wn_1xxx_inv):.1f}%)  Gap: {len(wn_1xxx_inv - wn_1xxx_covered):,}")

# Save still-uncovered for inspection
with open(os.path.join(HERE, "inventory_still_uncovered_v3.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["sku", "shape"])
    for s in sorted(still_gap):
        w.writerow([s, shape(s)])
print(f"\nWrote inventory_still_uncovered_v3.csv ({len(still_gap):,})")
