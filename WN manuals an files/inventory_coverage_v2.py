"""
Re-measure inventory ↔ OEM coverage using the LATEST data on disk:
  - wn_parts.sqlite (post-extraction; 35,627 distinct PDF SKUs)
  - eparts/*.json (572 BOM JSONs from eParts API)
  - Inventory: WN manuals an files/inventory_matched.csv

This bypasses Supabase — measures coverage of the NEW data before re-seeding.
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


# 1. PDF SKUs from wn_parts.sqlite
con = sqlite3.connect(os.path.join(HERE, "wn_parts.sqlite"))
pdf_skus = {row[0].strip() for row in con.execute(
    "SELECT DISTINCT part_number FROM parts WHERE part_number IS NOT NULL")
    if row[0]}
con.close()
print(f"PDF source SKUs (wn_parts.sqlite):     {len(pdf_skus):,}")

# 2. eParts SKUs from eparts/*.json (walking sub_revisions + components)
eparts_skus = set()
eparts_dir = os.path.join(HERE, "eparts")
for fname in os.listdir(eparts_dir):
    if not fname.endswith(".json"):
        continue
    try:
        d = json.load(open(os.path.join(eparts_dir, fname), encoding="utf-8"))
    except Exception:
        continue
    def walk(node):
        if isinstance(node, dict):
            pn = node.get("partNumber")
            if pn:
                pn = str(pn).strip()
                if pn:
                    eparts_skus.add(pn)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(d)
print(f"eParts API SKUs (eparts/*.json):       {len(eparts_skus):,}")
print(f"Combined OEM SKUs (union):             {len(eparts_skus | pdf_skus):,}")

# 3. Inventory SKUs from inventory_matched.csv
inv_skus = set()
with open(os.path.join(HERE, "inventory_matched.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if t: inv_skus.add(t)
print(f"Inventory unique SKUs (Wacker shape):  {len(inv_skus):,}")

# 4. Coverage
both = eparts_skus | pdf_skus
covered = inv_skus & both
in_eparts_only = (inv_skus & eparts_skus) - pdf_skus
in_pdfs_only = (inv_skus & pdf_skus) - eparts_skus
in_both = inv_skus & eparts_skus & pdf_skus
uncovered = inv_skus - both

print(f"\n=== COVERAGE (post-PDF-extraction, pre-Supabase-reseed) ===")
print(f"  Inventory total:                {len(inv_skus):>6,}  (100%)")
print(f"  Covered by OEM (any source):    {len(covered):>6,}  ({100*len(covered)/len(inv_skus):.1f}%)")
print(f"    - eParts API only:            {len(in_eparts_only):>6,}")
print(f"    - PDFs only:                  {len(in_pdfs_only):>6,}")
print(f"    - Both:                       {len(in_both):>6,}")
print(f"  Still uncovered:                {len(uncovered):>6,}  ({100*len(uncovered)/len(inv_skus):.1f}%)")

# Compare to before today
prior_covered = 783  # from earlier inventory_oem_source_breakdown
print(f"\n  Δ vs before today's PDF extraction: +{len(covered) - prior_covered:,} SKUs covered")

# Split coverage by SKU shape (WN construction vs Weidemann/Kramer)
print(f"\n=== Coverage split by SKU prefix ===")
print(f"{'Prefix':<18s}  {'inv':>6s}  {'covered':>8s}  {'pct':>5s}  {'gap':>6s}")
shapes_all = ["10d_5xxx", "10d_1xxx", "07d_legacy"]
for shp in shapes_all:
    inv_of_shape = {s for s in inv_skus if shape(s) == shp}
    cov = inv_of_shape & both
    gap = inv_of_shape - both
    pct = 100 * len(cov) / len(inv_of_shape) if inv_of_shape else 0
    label = {"10d_5xxx": "Wacker constr.",
             "10d_1xxx": "Weidemann/Kramer",
             "07d_legacy": "Legacy 0xxxxxx"}.get(shp, shp)
    print(f"  {label:<18s}  {len(inv_of_shape):>6,}  {len(cov):>8,}  {pct:>4.1f}%  {len(gap):>6,}")

# WN construction only — the actionable number
wn_constr = {s for s in inv_skus if shape(s) in ("10d_5xxx", "07d_legacy")}
wn_constr_covered = wn_constr & both
print(f"\n=== WN construction stocked only ===")
print(f"  Total:        {len(wn_constr):,}")
print(f"  Covered:      {len(wn_constr_covered):,}  ({100*len(wn_constr_covered)/len(wn_constr):.1f}%)")
print(f"  Gap:          {len(wn_constr - both):,}  ({100*len(wn_constr - both)/len(wn_constr):.1f}%)")

# Save uncovered for inspection
with open(os.path.join(HERE, "inventory_still_uncovered.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["sku", "shape"])
    for s in sorted(uncovered):
        w.writerow([s, shape(s)])
print(f"\nWrote inventory_still_uncovered.csv ({len(uncovered):,} SKUs)")
