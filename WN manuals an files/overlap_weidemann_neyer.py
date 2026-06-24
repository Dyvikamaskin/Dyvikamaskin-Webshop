"""
Overlap of the 178,663 retailer-union SKUs against:
  * The full Neyer set (45,584 from sitemap walk)
  * The Weidemann eService SAMPLE (2,313 from catalog 3, ids 1..500)

Note: Neyer is itself one of the 11 retailers in the union, so by construction
all 45,584 Neyer SKUs are in the union (just confirming).
Weidemann is NOT in the union — it's an external dealer-catalog sample.
"""
import csv
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

RETAILER_CSVS = [
    "wn_contractorsdirect.csv", "wn_danseusa.csv", "wn_dhs_klevu.csv",
    "wn_equipmentshare.csv", "wn_everestpartssupplies.csv", "wn_hydrotech.csv",
    "wn_neyer.csv", "wn_russopower.csv", "wn_tiendamamsa.csv",
    "wn_tmsequip_full.csv",
]


def load_csv(fname):
    s = set()
    with open(os.path.join(HERE, fname), encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            sku = (row.get("part_number") or "").strip()
            if sku:
                s.add(sku)
    return s


# Build retailer union (matches the analyzer's 178,663)
per_retailer = {f: load_csv(f) for f in RETAILER_CSVS}
union = set().union(*per_retailer.values())

# Add the Neyer sitemap-derived 45,584 SKUs (the 25K CSV is a strict subset)
neyer_full = {l.strip() for l in open(os.path.join(HERE, "neyer_skus_all.txt"), encoding="utf-8") if l.strip()}
union |= neyer_full
print(f"Retailer union (incl Neyer-45K sitemap): {len(union):,}")

# Weidemann sample from catalog 3 ids 1..500
wd_raw = open(os.path.join(HERE, "weidemann_cat3_skus.json"), encoding="utf-8").read()
m = re.search(r"(\{[\s\S]*\})", wd_raw)
wd = json.loads(m.group(1))
weidemann_cat3 = set(wd["skus_for_compare"])
print(f"Weidemann catalog 3 SAMPLE (ids 1-500): {len(weidemann_cat3):,}")

# ---- Overlaps ----
print("\n=== UNION (178K) ∩ Neyer (45,584) ===")
inter_neyer = union & neyer_full
print(f"  in union AND in Neyer:    {len(inter_neyer):,}")
print(f"  in Neyer but NOT in union: {len(neyer_full - union):,}  (should be 0 — Neyer is in the union)")

print("\n=== UNION (178K) ∩ Weidemann cat-3 sample (2,313) ===")
inter_wd = union & weidemann_cat3
print(f"  in union AND in Weidemann:  {len(inter_wd):,}  ({100*len(inter_wd)/len(weidemann_cat3):.1f}% of Weidemann sample)")
print(f"  in Weidemann but NOT in union: {len(weidemann_cat3 - union):,}  ← TRULY new SKUs if we scrape full Weidemann")

# Which retailers carry Weidemann SKUs?
print("\n=== Where each Weidemann sample SKU shows up ===")
for fname, skus in sorted(per_retailer.items(), key=lambda kv: -len(kv[1] & weidemann_cat3)):
    n = len(skus & weidemann_cat3)
    if n:
        print(f"  {fname:<35s} {n:>5,} of {len(weidemann_cat3):,}")
# And Neyer sitemap
n = len(neyer_full & weidemann_cat3)
print(f"  {'neyer_45k_sitemap':<35s} {n:>5,} of {len(weidemann_cat3):,}")

# Also: how much of the union is "Weidemann-style 1xxxxxxxxx"?
ten_d_1 = {s for s in union if re.fullmatch(r"1\d{9}", s)}
print(f"\n=== Weidemann-style prefix (1xxxxxxxxx) anywhere in the union ===")
print(f"  Total 1xxxxxxxxx SKUs in 178K union: {len(ten_d_1):,}")
print(f"  Of those, in Neyer 45K:               {len(ten_d_1 & neyer_full):,}")
print(f"  Of those, in NON-Neyer retailers:     {len(ten_d_1 - neyer_full):,}")

# Save the headline numbers
result = {
    "union_size": len(union),
    "union_intersect_neyer": len(inter_neyer),
    "union_intersect_weidemann_sample": len(inter_wd),
    "weidemann_sample_size": len(weidemann_cat3),
    "weidemann_only_not_in_union": len(weidemann_cat3 - union),
    "weidemann_prefix_1xxx_in_union": len(ten_d_1),
    "weidemann_prefix_1xxx_in_non_neyer_retailers": len(ten_d_1 - neyer_full),
    "per_retailer_weidemann_overlap": {
        fname: len(skus & weidemann_cat3) for fname, skus in per_retailer.items()
    },
}
with open(os.path.join(HERE, "overlap_weidemann_neyer.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("\nWrote overlap_weidemann_neyer.json")
