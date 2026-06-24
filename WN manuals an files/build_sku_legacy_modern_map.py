"""
Build a legacy <-> modern SAP part-number mapping for Wacker Neuson parts.

Wacker Neuson migrated from a 7-digit `0xxxxxxx` part number system to a 10-digit
`5xxxxxxxxx` SAP material number system. Many of our data sources still use
the legacy numbers (PDFs, your inventory descriptions), while others use modern
(eParts API, your inventory `Varenr. 2`).

This script mines paired references from every source we have and builds a
single mapping table you can join into the OEM catalog to bridge the gap.

Sources of pairs:
  A. DHS retailer CSV  — product title/URL slugs encode both ("...0110185-5000110185")
  B. Other retailer CSVs (danseusa, hydrotech, russopower, tmsequip, etc.) — same pattern
  C. wn_parts.sqlite — PDF-extracted parts; legacy in `part_number`, possibly
     modern in `description` / `notes`
  D. Your inventory file — `Varenr. 2` (modern) + `Beskrivelse` "X-0xxxxxxx" hints
  E. Adjacency pairs inside raw PDFs (transition-era catalogs with both formats)

Output:
  sku_legacy_modern_map.csv           — (legacy, modern, sources, confidence)
  sku_legacy_modern_map.json          — same data, indexed both ways
  sku_legacy_modern_map_report.md     — coverage summary
  unknowns_5xxx_resolved.csv          — for each of the 80 unknown 5xxx SKUs,
                                         the legacy equivalent (if found) and
                                         whether it appears in any of our PDFs
"""
import csv
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# Mapping accumulator
# pairs[(legacy, modern)] = set of source labels
pairs: dict[tuple[str, str], set[str]] = defaultdict(set)

LEGACY = r"0\d{6}"
MODERN = r"5\d{9}"
LEG_RE = re.compile(rf"\b({LEGACY})\b")
MOD_RE = re.compile(rf"\b({MODERN})\b")
# Adjacent pair: legacy first, then modern (or vice versa)
ADJ_RE_LM = re.compile(rf"\b({LEGACY})[-\s_]+({MODERN})\b")
ADJ_RE_ML = re.compile(rf"\b({MODERN})[-\s_]+({LEGACY})\b")
# "X-0123456" embedded in inventory descriptions
X_LEGACY_RE = re.compile(rf"X-({LEGACY})")


def add(legacy: str, modern: str, src: str):
    if not legacy or not modern:
        return
    pairs[(legacy, modern)].add(src)


# =========================================================
# SOURCE A + B: retailer CSVs — URL slugs/titles encode pairs
# =========================================================
print("=" * 60)
print("SOURCES A+B: retailer CSVs (URL slugs encode legacy-modern pairs)")
print("=" * 60)
RETAILER_CSVS = [
    "wn_dhs_klevu.csv", "wn_dhs.csv",
    "wn_danseusa.csv", "wn_hydrotech.csv", "wn_russopower.csv",
    "wn_contractorsdirect.csv", "wn_equipmentshare.csv",
    "wn_everestpartssupplies.csv", "wn_tmsequip_full.csv",
    "wn_tiendamamsa.csv", "wn_neyer.csv",
]
for fname in RETAILER_CSVS:
    p = os.path.join(HERE, fname)
    if not os.path.exists(p): continue
    src = fname.replace(".csv", "").replace("wn_", "")
    n_before = len(pairs)
    with open(p, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            # Scan every value for adjacent pairs
            haystack = " ".join(str(v) for v in row.values() if v)
            for m in ADJ_RE_LM.finditer(haystack):
                add(m.group(1), m.group(2), f"retailer:{src}")
            for m in ADJ_RE_ML.finditer(haystack):
                add(m.group(2), m.group(1), f"retailer:{src}")
            # ALSO: if the row has a primary part_number that's legacy
            # and alt_skus / handle contains a modern (or vice versa),
            # treat them as paired
            pn = (row.get("part_number") or "").strip()
            alt = (row.get("alt_skus") or "").strip()
            handle = (row.get("handle") or "").strip()
            url = (row.get("product_url") or "").strip()
            haystack2 = " ".join([alt, handle, url, row.get("name") or "", row.get("raw_title") or ""])
            legs_in_row = set(LEG_RE.findall(haystack2 + " " + pn))
            mods_in_row = set(MOD_RE.findall(haystack2 + " " + pn))
            if legs_in_row and mods_in_row:
                # If exactly one of each, definite pair; otherwise pair all combos
                # but lower confidence — store all combos; downstream code can
                # use the count of (legacy, modern) pairs to weight confidence
                for l in legs_in_row:
                    for m in mods_in_row:
                        add(l, m, f"retailer:{src}:co-occur")
    n_added = len(pairs) - n_before
    print(f"  {fname:<35s} +{n_added:,} new pairs (running total: {len(pairs):,})")


# =========================================================
# SOURCE C: wn_parts.sqlite — PDF-extracted parts
# =========================================================
print("\n" + "=" * 60)
print("SOURCE C: wn_parts.sqlite — PDF-extracted parts (description/notes)")
print("=" * 60)
con = sqlite3.connect(os.path.join(HERE, "wn_parts.sqlite"))
n_before = len(pairs)
for pn, desc, notes in con.execute("SELECT part_number, description, notes FROM parts"):
    pn = (pn or "").strip()
    haystack = " ".join([desc or "", notes or "", pn])
    # X-NNNNNNN embedded
    for m in X_LEGACY_RE.finditer(haystack):
        leg = m.group(1)
        mods_here = MOD_RE.findall(haystack)
        if MOD_RE.fullmatch(pn):
            add(leg, pn, "pdf:X-prefix+modern-pn")
        for mod in mods_here:
            add(leg, mod, "pdf:X-prefix+co-occur")
    # Adjacent legacy-modern in same row
    for m in ADJ_RE_LM.finditer(haystack):
        add(m.group(1), m.group(2), "pdf:adjacent")
    for m in ADJ_RE_ML.finditer(haystack):
        add(m.group(2), m.group(1), "pdf:adjacent")
    # If pn is legacy and modern in description (or vice versa)
    if LEG_RE.fullmatch(pn):
        for mod in MOD_RE.findall(haystack):
            add(pn, mod, "pdf:pn-legacy+desc-modern")
    elif MOD_RE.fullmatch(pn):
        for leg in LEG_RE.findall(haystack):
            add(leg, pn, "pdf:pn-modern+desc-legacy")
con.close()
print(f"  +{len(pairs) - n_before:,} new pairs from wn_parts.sqlite (total: {len(pairs):,})")


# =========================================================
# SOURCE D: your inventory file
# =========================================================
print("\n" + "=" * 60)
print("SOURCE D: inventory xlsx — Varenr.2 (modern) + Beskrivelse X-legacy")
print("=" * 60)
INV = r"C:\Users\Public\Documents\Inventory DM-WN.xlsx"
wb = openpyxl.load_workbook(INV, read_only=True, data_only=True)
ws = wb["Vareopptellingskladder"]
rows = list(ws.iter_rows(values_only=True))
n_before = len(pairs)
# Header: Bunkenavn, Varenr., Varenr. 2, Beskrivelse, Antall, ItemDescription, Leverandør, Kategori
for row in rows[1:]:
    if not row or not row[2]: continue
    modern = str(row[2]).strip() if row[2] else ""
    if not MOD_RE.fullmatch(modern):
        continue
    haystack = " ".join(str(c) for c in row[3:6] if c)  # Beskrivelse + ItemDescription
    for m in X_LEGACY_RE.finditer(haystack):
        add(m.group(1), modern, "inventory:X-prefix")
    # Also: any bare legacy 0xxxxxx in description paired with the row's modern
    for leg in LEG_RE.findall(haystack):
        add(leg, modern, "inventory:co-occur")
print(f"  +{len(pairs) - n_before:,} new pairs (total: {len(pairs):,})")


# =========================================================
# Persist the mapping
# =========================================================
print("\n" + "=" * 60)
print("Building outputs")
print("=" * 60)

# Confidence heuristic: each unique source category = 1 confidence point.
# 'retailer:X' and 'retailer:X:co-occur' count as different signals.
def confidence(srcs: set) -> int:
    return len(srcs)


# Distinct mapping (legacy → modern, modern → legacy)
modern_to_legacy = defaultdict(set)
legacy_to_modern = defaultdict(set)
for (leg, mod), srcs in pairs.items():
    modern_to_legacy[mod].add(leg)
    legacy_to_modern[leg].add(mod)

print(f"\nDistinct pairs:               {len(pairs):,}")
print(f"Distinct modern SKUs mapped:  {len(modern_to_legacy):,}")
print(f"Distinct legacy SKUs mapped:  {len(legacy_to_modern):,}")

# CSV: one row per pair, sorted by confidence desc
csv_path = os.path.join(HERE, "sku_legacy_modern_map.csv")
with open(csv_path, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["legacy", "modern", "n_sources", "sources"])
    sorted_pairs = sorted(pairs.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    for (leg, mod), srcs in sorted_pairs:
        w.writerow([leg, mod, len(srcs), ";".join(sorted(srcs))])
print(f"Wrote {csv_path}")

# JSON indexed both directions
json_path = os.path.join(HERE, "sku_legacy_modern_map.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump({
        "modern_to_legacy": {k: sorted(v) for k, v in modern_to_legacy.items()},
        "legacy_to_modern": {k: sorted(v) for k, v in legacy_to_modern.items()},
        "n_pairs": len(pairs),
    }, f, ensure_ascii=False, indent=2)
print(f"Wrote {json_path}")


# =========================================================
# Resolve the 80 unknown 5xxx SKUs via the mapping
# =========================================================
print("\n" + "=" * 60)
print("Cross-checking the 80 unknown 5xxx inventory SKUs")
print("=" * 60)
unknowns = []
with open(os.path.join(HERE, "unknowns_5xxx.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        unknowns.append((r["sku_5xxx"], r["Beskrivelse"]))
unknown_skus = sorted({s for s, _ in unknowns})
print(f"  unknowns: {len(unknown_skus)}")

# Load the legacy SKUs present in the two user-supplied PDFs (we already
# extracted them earlier)
pdf_legacies = set()
for pdf_txt in ["pdfcheck_0610344-Rev101.txt", "pdfcheck_5000008900-Rev101.txt"]:
    p = os.path.join(HERE, pdf_txt)
    if os.path.exists(p):
        text = open(p, encoding="utf-8").read()
        pdf_legacies |= set(LEG_RE.findall(text))
# Also pull every legacy partNumber from wn_parts.sqlite
con = sqlite3.connect(os.path.join(HERE, "wn_parts.sqlite"))
db_legacies = {row[0] for row in con.execute(
    "SELECT DISTINCT part_number FROM parts WHERE part_number LIKE '0%'"
)}
con.close()
print(f"  legacy SKUs in user PDFs:        {len(pdf_legacies):,}")
print(f"  legacy SKUs in wn_parts.sqlite:  {len(db_legacies):,}")

resolved_path = os.path.join(HERE, "unknowns_5xxx_resolved.csv")
n_with_legacy = 0
n_in_user_pdfs = 0
n_in_db_pdfs = 0
with open(resolved_path, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["modern_5xxx", "Beskrivelse", "legacy_candidates",
                "in_user_pdfs", "in_wn_parts_sqlite", "mapping_sources"])
    for sku, desc in unknowns:
        legs = sorted(modern_to_legacy.get(sku, set()))
        in_user = sorted({l for l in legs if l in pdf_legacies})
        in_db = sorted({l for l in legs if l in db_legacies})
        if legs: n_with_legacy += 1
        if in_user: n_in_user_pdfs += 1
        if in_db: n_in_db_pdfs += 1
        # Pull source labels for the mapping
        src_labels = set()
        for l in legs:
            src_labels |= pairs.get((l, sku), set())
        w.writerow([sku, desc, ";".join(legs),
                    ";".join(in_user), ";".join(in_db),
                    ";".join(sorted(src_labels))])

print(f"\nResults written to {resolved_path}")
print(f"  Unknowns with at least one legacy candidate: {n_with_legacy}/{len(unknown_skus)}")
print(f"  Unknowns resolved to a legacy that IS in the user PDFs: {n_in_user_pdfs}/{len(unknown_skus)}")
print(f"  Unknowns resolved to a legacy in the larger PDF DB (313 manuals): {n_in_db_pdfs}/{len(unknown_skus)}")


# Markdown summary
md = ["# Legacy ↔ Modern SAP cross-reference build\n"]
md.append(f"- Distinct (legacy, modern) pairs: **{len(pairs):,}**")
md.append(f"- Distinct modern SKUs mapped:     **{len(modern_to_legacy):,}**")
md.append(f"- Distinct legacy SKUs mapped:     **{len(legacy_to_modern):,}**\n")
md.append("## 80 'unknown' stocked SKUs — resolution\n")
md.append("| Metric | Count |")
md.append("|---|---:|")
md.append(f"| With ≥1 legacy candidate via mapping | {n_with_legacy} / {len(unknown_skus)} |")
md.append(f"| Legacy is in the 2 user PDFs | {n_in_user_pdfs} / {len(unknown_skus)} |")
md.append(f"| Legacy is somewhere in wn_parts.sqlite (313 PDFs) | {n_in_db_pdfs} / {len(unknown_skus)} |")
md.append("")
# Source contribution
src_hist = Counter()
for srcs in pairs.values():
    for s in srcs: src_hist[s] += 1
md.append("## Pairs by source signal\n")
md.append("| Source | Pair count |")
md.append("|---|---:|")
for s, n in src_hist.most_common(30):
    md.append(f"| `{s}` | {n:,} |")
md.append("")
md.append("See `sku_legacy_modern_map.csv` for every pair, "
          "`sku_legacy_modern_map.json` for the indexed lookup, and "
          "`unknowns_5xxx_resolved.csv` for the gap-resolution detail.")
with open(os.path.join(HERE, "sku_legacy_modern_map_report.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(md))
print(f"\nWrote sku_legacy_modern_map_report.md")
print("\n=== DONE ===")
