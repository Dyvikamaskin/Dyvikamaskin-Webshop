"""
Map the user's inventory file 'Inventory DM-WN.xlsx' against:
  * OEM catalog (44,894)
  * Retailer union (178,663)
  * Neyer 45K
  * Weidemann cat-3 sample (2,313)
  * DHS (the big retailer)
  * hydrotech (the best WN construction price source)

Auto-detects the SKU column from the inventory sheet. Falls back to a regex
sweep of every cell if no obvious column name matches.

Outputs:
  inventory_overlap_report.md   — human-readable summary
  inventory_overlap_report.json — full numbers
  inventory_unmatched.csv       — inventory rows that didn't match any source
  inventory_matched.csv         — inventory rows tagged with which sources have them
"""
import csv
import json
import os
import re
import sys
from collections import Counter

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

INV_PATH = r"C:\Users\Public\Documents\Inventory DM-WN.xlsx"
HERE = os.path.dirname(os.path.abspath(__file__))

CANDIDATE_SKU_COLS = [
    "part_number", "partnumber", "part no", "part no.", "part #", "part",
    "sku", "item no", "item no.", "item number", "item #", "item",
    "artikel", "artikelnummer", "artikel-nr", "art.-nr", "art nr",
    "material", "material no", "material number",
    "varenr", "varenr.", "varenummer",
    "produktnr", "produkt nr",
]


def is_wacker_shape(s: str) -> bool:
    if re.fullmatch(r"\d{7}", s): return True   # legacy 0xxxxxx
    if re.fullmatch(r"\d{10}", s) and s[0] in ("1", "5"): return True
    return False


def normalise(s) -> str:
    if s is None: return ""
    s = str(s).strip()
    # Strip common decorations: leading/trailing dashes, dots, whitespace
    s = re.sub(r"^[\s\-\.]+|[\s\-\.]+$", "", s)
    # Sometimes Excel stores numbers — drop trailing ".0"
    if re.fullmatch(r"\d+\.0", s): s = s[:-2]
    return s


def load_inventory():
    print(f"Opening {INV_PATH} ...", flush=True)
    wb = openpyxl.load_workbook(INV_PATH, read_only=True, data_only=True)
    all_sheets = {}
    for ws in wb.worksheets:
        print(f"\nSheet: {ws.title!r}", flush=True)
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        # Find the header row — first row with >=2 non-empty cells, and at
        # least one that looks like a SKU column header
        header_row_idx = None
        header = None
        for i, row in enumerate(rows[:30]):
            cells = [normalise(c).lower() for c in row]
            if any(c in CANDIDATE_SKU_COLS for c in cells) or \
               any(re.search(r"part|sku|item|artikel|material|varenr", c) for c in cells if c):
                header_row_idx = i
                header = [normalise(c) for c in row]
                break
        if header_row_idx is None:
            print(f"  No obvious header row — first row: {rows[0][:8]}", flush=True)
            continue
        print(f"  Header at row {header_row_idx + 1}: {header[:10]}", flush=True)
        data_rows = rows[header_row_idx + 1:]
        all_sheets[ws.title] = {"header": header, "rows": data_rows, "header_row": header_row_idx}

    return all_sheets


def find_sku_col(header: list[str]) -> int | None:
    """Return the most likely SKU column index."""
    lower = [h.lower() for h in header]
    # Exact match first
    for i, h in enumerate(lower):
        if h in CANDIDATE_SKU_COLS:
            return i
    # Substring match
    for keyword in ["part number", "partnumber", "part no", "part_no",
                    "item number", "item no", "sku", "artikel", "material",
                    "varenr", "produkt"]:
        for i, h in enumerate(lower):
            if keyword in h:
                return i
    return None


def collect_skus(sheets):
    """For each row, capture the primary SKU + any Wacker-shape number found
    anywhere on the row (so we catch cross-references in 'Varenr. 2' /
    description / category columns)."""
    inv_skus = []   # list of dicts
    for sheet_name, data in sheets.items():
        header = data["header"]
        rows = data["rows"]
        primary_col = find_sku_col(header)
        col_label = repr(header[primary_col]) if primary_col is not None else "auto-detect"
        print(f"  [{sheet_name}] primary SKU column = {primary_col} ({col_label})")
        for r_idx, row in enumerate(rows):
            # Primary SKU (internal code, usually)
            primary_raw = row[primary_col] if primary_col is not None and primary_col < len(row) else None
            primary = normalise(primary_raw)
            if not primary:
                # Skip empty rows
                continue
            # Scan every other cell for a Wacker-shape number
            wacker_candidates = []
            for c_idx, cell in enumerate(row):
                if c_idx == primary_col:
                    continue
                s = normalise(cell)
                # Some cells may have multiple tokens
                for tok in re.split(r"[\s,;/]+", s):
                    tok = normalise(tok)
                    if is_wacker_shape(tok):
                        wacker_candidates.append((c_idx, header[c_idx] if c_idx < len(header) else "", tok))
            inv_skus.append({
                "sheet": sheet_name,
                "row_idx": r_idx,
                "primary_raw": primary_raw,
                "primary": primary,
                "wacker_candidates": wacker_candidates,
                "row_snapshot": [normalise(c) for c in row[:10]],
            })
    return inv_skus


def load_retailer_union():
    union = set()
    per = {}
    for fname in os.listdir(HERE):
        if not (fname.startswith("wn_") and fname.endswith(".csv") and "smoke" not in fname):
            continue
        path = os.path.join(HERE, fname)
        s = set()
        with open(path, encoding="utf-8", errors="replace", newline="") as f:
            for row in csv.DictReader(f):
                sku = (row.get("part_number") or "").strip()
                if sku:
                    s.add(sku)
        per[fname] = s
        union |= s
    # Add the Neyer sitemap full
    neyer_full = {l.strip() for l in open(os.path.join(HERE, "neyer_skus_all.txt"), encoding="utf-8") if l.strip()}
    per["neyer_45k_sitemap"] = neyer_full
    union |= neyer_full
    return per, union


def load_oem_db():
    p = os.path.join(HERE, "oem_skus_dump.txt")
    raw = open(p, encoding="utf-8").read()
    return set(re.findall(r'(?:\\")?partNumber(?:\\")?\s*:\s*(?:\\")?([^"\\,}]+)', raw))


def load_weidemann_sample():
    p = os.path.join(HERE, "weidemann_cat3_skus.json")
    raw = open(p, encoding="utf-8").read()
    m = re.search(r"(\{[\s\S]*\})", raw)
    d = json.loads(m.group(1))
    return set(d["skus_for_compare"])


def main():
    sheets = load_inventory()
    if not sheets:
        print("No usable sheets found.")
        return

    inv_rows = collect_skus(sheets)
    # All Wacker-shape SKUs found anywhere on any row (the cross-references)
    wacker_skus = sorted({tok for r in inv_rows for (_, _, tok) in r["wacker_candidates"]})
    print(f"\nInventory rows scanned:           {len(inv_rows):,}")
    print(f"Rows with ≥1 Wacker-shape number: "
          f"{sum(1 for r in inv_rows if r['wacker_candidates']):,}")
    print(f"Unique Wacker-shape values found: {len(wacker_skus):,}")

    # Which columns yielded the SKUs?
    col_origin = Counter()
    for r in inv_rows:
        for c_idx, c_name, tok in r["wacker_candidates"]:
            col_origin[f"col {c_idx} ({c_name!r})"] += 1
    print("\nWacker-shape SKUs by source column:")
    for k, v in col_origin.most_common():
        print(f"  {k:<40s} {v:>5,}")

    # Shape histogram of the Wacker-shape numbers
    def shape(s):
        if re.fullmatch(r"\d{7}", s): return "07d_legacy_0xxx"
        if re.fullmatch(r"\d{10}", s):
            return f"10d_{s[0]}xxx"
        if re.fullmatch(r"\d{8,9}", s): return f"{len(s)}d"
        if re.fullmatch(r"\d{11,12}", s): return f"{len(s)}d"
        return "other"
    shapes = Counter(shape(s) for s in wacker_skus)
    print("\nShape breakdown of extracted SKUs:")
    for k, v in shapes.most_common():
        print(f"  {k:<25s} {v:>7,}")

    inv_skus = wacker_skus

    # Load reference sets
    per_retailer, union = load_retailer_union()
    oem_db = load_oem_db()
    weidemann = load_weidemann_sample()
    print(f"\nReference set sizes:")
    print(f"  OEM catalog:              {len(oem_db):,}")
    print(f"  Retailer union:           {len(union):,}")
    print(f"  Weidemann cat-3 sample:   {len(weidemann):,}")
    print(f"  Neyer 45K sitemap:        {len(per_retailer['neyer_45k_sitemap']):,}")

    inv_set = set(inv_skus)
    in_oem    = inv_set & oem_db
    in_union  = inv_set & union
    in_weid   = inv_set & weidemann
    in_neyer  = inv_set & per_retailer["neyer_45k_sitemap"]
    no_source = inv_set - oem_db - union - weidemann

    print(f"\n=== INVENTORY OVERLAP ===")
    print(f"  Inventory total unique SKUs:     {len(inv_set):>7,}")
    print(f"  In our OEM catalog (44,894):     {len(in_oem):>7,}  ({100*len(in_oem)/len(inv_set):.1f}%)")
    print(f"  In retailer union (178,663):     {len(in_union):>7,}  ({100*len(in_union)/len(inv_set):.1f}%)")
    print(f"  In Neyer 45K (Weidemann/Kramer): {len(in_neyer):>7,}  ({100*len(in_neyer)/len(inv_set):.1f}%)")
    print(f"  In Weidemann sample (2,313):     {len(in_weid):>7,}")
    print(f"  In NONE of the above:            {len(no_source):>7,}  ({100*len(no_source)/len(inv_set):.1f}%)")

    # Per-retailer breakdown
    print(f"\n=== INVENTORY × each retailer ===")
    rows_table = []
    for src, skus in sorted(per_retailer.items(), key=lambda kv: -len(kv[1] & inv_set)):
        n = len(skus & inv_set)
        rows_table.append((src, len(skus), n, 100 * n / len(inv_set)))
        print(f"  {src:<35s}  retailer={len(skus):>7,}  in_inv={n:>6,}  ({100*n/len(inv_set):.1f}% of inventory)")

    # Per-row CSV with cross-ref + source tags
    with open(os.path.join(HERE, "inventory_matched.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sheet", "row_idx", "primary_sku", "wacker_skus_found",
                    "source_columns", "shapes",
                    "in_oem", "in_union", "in_weidemann_sample", "in_neyer_45k",
                    "retailers_carrying"])
        for r in inv_rows:
            toks = [t for _, _, t in r["wacker_candidates"]]
            cols = ";".join(sorted({f"{c_idx}:{c_name}" for c_idx, c_name, _ in r["wacker_candidates"]}))
            shps = ";".join(sorted({shape(t) for t in toks}))
            carriers = sorted({n for n, s in per_retailer.items() for t in toks if t in s})
            w.writerow([
                r["sheet"], r["row_idx"], r["primary"],
                ";".join(toks), cols, shps,
                "Y" if any(t in oem_db for t in toks) else "",
                "Y" if any(t in union for t in toks) else "",
                "Y" if any(t in weidemann for t in toks) else "",
                "Y" if any(t in per_retailer["neyer_45k_sitemap"] for t in toks) else "",
                ";".join(carriers),
            ])
    print(f"\nWrote inventory_matched.csv ({len(inv_rows):,} rows)")

    # Unmatched: rows where NO Wacker-shape number was found OR none of them
    # matched any known source
    with open(os.path.join(HERE, "inventory_unmatched.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sheet", "row_idx", "primary_sku", "row_snapshot",
                    "had_wacker_shape", "reason"])
        for r in inv_rows:
            toks = [t for _, _, t in r["wacker_candidates"]]
            matched_any = any(t in oem_db or t in union or t in weidemann for t in toks)
            if matched_any:
                continue
            reason = "no Wacker-shape number found anywhere on row" if not toks \
                     else "Wacker-shape number found but no source has it"
            w.writerow([r["sheet"], r["row_idx"], r["primary"],
                        " | ".join(r["row_snapshot"]),
                        "Y" if toks else "",
                        reason])
    print(f"Wrote inventory_unmatched.csv")

    # JSON summary
    out = {
        "inventory_path": INV_PATH,
        "sheets": {name: {"header": data["header"][:20]} for name, data in sheets.items()},
        "inventory_unique_skus": len(inv_set),
        "inventory_rows_with_sku": len(inv_rows),
        "inventory_shape_breakdown": dict(shapes.most_common()),
        "in_oem":   len(in_oem),
        "in_union": len(in_union),
        "in_neyer_45k": len(in_neyer),
        "in_weidemann_sample": len(in_weid),
        "in_none": len(no_source),
        "per_retailer": [
            {"source": src, "retailer_size": rs, "in_inventory": n,
             "pct_of_inventory": round(p, 1)}
            for src, rs, n, p in rows_table
        ],
        "first_20_unmatched_skus": sorted(no_source)[:20],
    }
    with open(os.path.join(HERE, "inventory_overlap_report.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # Markdown summary
    md = []
    md.append(f"# Inventory DM-WN — overlap with our catalog and retailer scrapes\n")
    md.append(f"Source file: `{INV_PATH}`\n")
    md.append(f"Sheets scanned: {', '.join(repr(n) for n in sheets)}\n")
    md.append(f"## Inventory size\n")
    md.append(f"- Unique SKU-shaped values: **{len(inv_set):,}**")
    md.append(f"- Rows with a SKU: **{len(inv_rows):,}**")
    md.append(f"")
    md.append(f"### SKU shape breakdown")
    md.append(f"")
    md.append("| Shape | Count |")
    md.append("|---|---:|")
    for k, v in shapes.most_common():
        md.append(f"| `{k}` | {v:,} |")
    md.append("")
    md.append(f"## Coverage\n")
    md.append("| Reference set | Size | In inventory | % of inventory |")
    md.append("|---|---:|---:|---:|")
    md.append(f"| OEM catalog (DB) | {len(oem_db):,} | {len(in_oem):,} | {100*len(in_oem)/len(inv_set):.1f}% |")
    md.append(f"| Retailer union | {len(union):,} | {len(in_union):,} | {100*len(in_union)/len(inv_set):.1f}% |")
    md.append(f"| Neyer 45K (Weidemann/Kramer) | {len(per_retailer['neyer_45k_sitemap']):,} | {len(in_neyer):,} | {100*len(in_neyer)/len(inv_set):.1f}% |")
    md.append(f"| Weidemann sample | {len(weidemann):,} | {len(in_weid):,} | {100*len(in_weid)/len(inv_set):.1f}% |")
    md.append(f"| **No match anywhere** | — | **{len(no_source):,}** | **{100*len(no_source)/len(inv_set):.1f}%** |")
    md.append("")
    md.append("## Per-retailer overlap with inventory\n")
    md.append("| Retailer | SKUs | In inventory | % of inv |")
    md.append("|---|---:|---:|---:|")
    for src, rs, n, p in rows_table:
        md.append(f"| `{src}` | {rs:,} | {n:,} | {p:.1f}% |")
    md.append("")
    md.append("## Outputs\n")
    md.append("- `inventory_matched.csv` — every inventory SKU + tags showing which sources carry it")
    md.append("- `inventory_unmatched.csv` — SKUs not found in OEM, any retailer, or Weidemann sample")
    md.append("- `inventory_overlap_report.json` — full numbers")
    with open(os.path.join(HERE, "inventory_overlap_report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print(f"Wrote inventory_overlap_report.md")
    print(f"Wrote inventory_overlap_report.json")


if __name__ == "__main__":
    main()
