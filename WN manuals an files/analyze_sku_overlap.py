"""
Cross-source SKU overlap analysis for the OEM parts catalog.

Inputs (all under "WN manuals an files/"):
  * Per-retailer price CSVs (`part_number` column):
      wn_contractorsdirect.csv, wn_danseusa.csv, wn_dhs_klevu.csv,
      wn_equipmentshare.csv, wn_everestpartssupplies.csv, wn_hydrotech.csv,
      wn_neyer.csv, wn_russopower.csv, wn_tiendamamsa.csv, wn_tmsequip_full.csv
  * neyer_skus_all.txt        — 45,584 SKUs from Neyer sitemap walk
  * OEM catalog SKU dump      — read from MCP-result dumped earlier
                                (the file passed via --oem-skus-source)

Outputs:
  * sku_overlap_report.json   — full pairwise overlap matrix + per-source stats
  * sku_overlap_report.md     — human-readable summary (matrix + commentary)
  * sku_overlap_report.csv    — long-form (source_a, source_b, intersection, jaccard)

Usage:
  python analyze_sku_overlap.py [--oem-skus-source path]
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import Counter
from itertools import combinations

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))

RETAILER_CSVS = {
    "contractorsdirect": "wn_contractorsdirect.csv",
    "danseusa":          "wn_danseusa.csv",
    "dhs":               "wn_dhs_klevu.csv",
    "equipmentshare":    "wn_equipmentshare.csv",
    "everestparts":      "wn_everestpartssupplies.csv",
    "hydrotech":         "wn_hydrotech.csv",
    "neyer_25k":         "wn_neyer.csv",
    "russopower":        "wn_russopower.csv",
    "tiendamamsa":       "wn_tiendamamsa.csv",
    "tmsequip":          "wn_tmsequip_full.csv",
}


def load_csv_skus(path: str) -> set[str]:
    skus = set()
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            sku = (row.get("part_number") or "").strip()
            if sku:
                skus.add(sku)
    return skus


def shape(sku: str) -> str:
    if re.fullmatch(r"\d{7}", sku):  return "07d_legacy"
    if re.fullmatch(r"\d{8}", sku):  return "08d"
    if re.fullmatch(r"\d{9}", sku):  return "09d"
    if re.fullmatch(r"\d{10}", sku):
        return f"10d_{sku[0]}xxx"
    if re.fullmatch(r"\d{11,12}", sku): return f"{len(sku)}d"
    return "other"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--oem-skus-source",
        default=os.path.join(HERE, "oem_skus_dump.txt"),
        help="A file containing one OEM partNumber per line. If missing, "
             "we'll try to parse the MCP-result dump fallback path.",
    )
    ap.add_argument("--report-json", default=os.path.join(HERE, "sku_overlap_report.json"))
    ap.add_argument("--report-md",   default=os.path.join(HERE, "sku_overlap_report.md"))
    ap.add_argument("--report-csv",  default=os.path.join(HERE, "sku_overlap_report.csv"))
    args = ap.parse_args()

    # --- Load all sources ---
    sources: dict[str, set[str]] = {}

    for label, fname in RETAILER_CSVS.items():
        p = os.path.join(HERE, fname)
        if not os.path.exists(p):
            print(f"  [skip] {label} ({fname} not found)", flush=True)
            continue
        s = load_csv_skus(p)
        sources[label] = s
        print(f"  loaded {label:<18s} {len(s):>7,}", flush=True)

    # Neyer sitemap (45,584 SKUs, supersedes the 25K CSV — keep BOTH for the
    # report so the user can see what the price CSV alone covers)
    neyer_full = os.path.join(HERE, "neyer_skus_all.txt")
    if os.path.exists(neyer_full):
        sources["neyer_45k_sitemap"] = {
            l.strip() for l in open(neyer_full, encoding="utf-8") if l.strip()
        }
        print(f"  loaded neyer_45k_sitemap   {len(sources['neyer_45k_sitemap']):>7,}", flush=True)

    # OEM catalog SKUs — try regex first (handles dumped MCP/JSON output),
    # fall back to line-split (handles a clean one-SKU-per-line .txt).
    if os.path.exists(args.oem_skus_source):
        raw = open(args.oem_skus_source, encoding="utf-8").read()
        # Match both escaped (\"partNumber\":\"X\") and plain ("partNumber":"X")
        # JSON shapes — the MCP dump escapes quotes.
        oem = set(re.findall(r'(?:\\")?partNumber(?:\\")?\s*:\s*(?:\\")?([^"\\,}]+)', raw))
        if not oem:
            oem = {l.strip() for l in raw.splitlines() if l.strip() and not l.startswith(("{", "<", "["))}
        sources["oem_catalog_db"] = oem
        print(f"  loaded oem_catalog_db      {len(oem):>7,}", flush=True)

    # --- Pairwise overlap matrix ---
    labels = sorted(sources.keys())
    matrix = {a: {} for a in labels}
    long_rows = []
    for a, b in combinations(labels, 2):
        inter = sources[a] & sources[b]
        union = sources[a] | sources[b]
        jaccard = len(inter) / len(union) if union else 0
        matrix[a][b] = {"intersection": len(inter), "jaccard": jaccard}
        matrix[b][a] = matrix[a][b]
        long_rows.append({
            "source_a": a, "source_b": b,
            "size_a": len(sources[a]), "size_b": len(sources[b]),
            "intersection": len(inter),
            "jaccard": round(jaccard, 4),
            "pct_of_smaller": round(100 * len(inter) / min(len(sources[a]), len(sources[b])), 1)
                              if min(len(sources[a]), len(sources[b])) else 0,
        })

    # Per-source stats: total + shape breakdown
    per_source = {}
    for label, skus in sources.items():
        shapes = Counter(shape(s) for s in skus)
        per_source[label] = {
            "count": len(skus),
            "shape_breakdown": dict(shapes.most_common()),
        }

    # SKUs unique to ONE source (across the retailer set, excluding the OEM DB)
    retailer_labels = [l for l in labels if l not in ("oem_catalog_db",)]
    sku_to_sources: dict[str, list[str]] = {}
    for label in retailer_labels:
        for s in sources[label]:
            sku_to_sources.setdefault(s, []).append(label)
    coverage_histogram = Counter(len(v) for v in sku_to_sources.values())

    universe = set().union(*[sources[l] for l in retailer_labels]) if retailer_labels else set()
    in_oem = sources.get("oem_catalog_db", set())
    retailers_only_no_oem = universe - in_oem
    oem_only_no_retailers = in_oem - universe

    # --- Reports ---
    report = {
        "sources": per_source,
        "pairwise_matrix": matrix,
        "long_form": long_rows,
        "coverage_histogram": dict(coverage_histogram),
        "universe_size_retailers": len(universe),
        "oem_db_size": len(in_oem),
        "retailers_have_not_in_oem": len(retailers_only_no_oem),
        "oem_has_not_in_retailers": len(oem_only_no_retailers),
    }
    with open(args.report_json, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {args.report_json}")

    # Long-form CSV — easy to load in a spreadsheet
    with open(args.report_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["source_a", "source_b", "size_a", "size_b",
                                          "intersection", "jaccard", "pct_of_smaller"])
        w.writeheader()
        w.writerows(long_rows)
    print(f"Wrote {args.report_csv}")

    # Markdown summary
    lines = []
    lines.append("# Retailer SKU overlap — auto-generated\n")
    lines.append("This file is regenerated by `analyze_sku_overlap.py`. Manual edits are "
                 "overwritten; commentary belongs in `docs/oem-data-sources.md`.\n")
    lines.append("## Per-source SKU counts\n")
    lines.append("| Source | SKU count | Dominant prefix |")
    lines.append("|---|---:|---|")
    for label in sorted(per_source, key=lambda k: -per_source[k]["count"]):
        shapes = per_source[label]["shape_breakdown"]
        top_shape = next(iter(shapes), "—")
        lines.append(f"| `{label}` | {per_source[label]['count']:,} | {top_shape} ({shapes[top_shape]:,}) |")
    lines.append("\n## Pairwise overlap matrix (|A ∩ B|)\n")
    header = "| | " + " | ".join(labels) + " |"
    sep = "|" + "---|" * (len(labels) + 1)
    lines.append(header)
    lines.append(sep)
    for a in labels:
        cells = [f"**{a}**"]
        for b in labels:
            if a == b:
                cells.append(f"**{len(sources[a]):,}**")
            else:
                cells.append(f"{matrix[a][b]['intersection']:,}")
        lines.append("| " + " | ".join(cells) + " |")
    lines.append("\n## Coverage histogram\n")
    lines.append("How many retailer sources each SKU appears in (excluding `oem_catalog_db`):")
    lines.append("")
    lines.append("| In N retailers | SKU count |")
    lines.append("|---:|---:|")
    for k in sorted(coverage_histogram):
        lines.append(f"| {k} | {coverage_histogram[k]:,} |")
    lines.append("")
    lines.append(f"- Total unique SKUs across retailers: **{len(universe):,}**")
    if "oem_catalog_db" in sources:
        lines.append(f"- OEM catalog (DB): **{len(in_oem):,}**")
        lines.append(f"- Retailer SKUs NOT in OEM catalog: **{len(retailers_only_no_oem):,}**")
        lines.append(f"- OEM catalog SKUs NOT in any retailer: **{len(oem_only_no_retailers):,}**")
    lines.append("")
    with open(args.report_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {args.report_md}")

    # Stdout headline summary so the user sees the punchline in `tail`
    print("\n=== HEADLINE ===")
    if "oem_catalog_db" in sources:
        print(f"OEM catalog:       {len(in_oem):,} SKUs")
    print(f"Retailer union:    {len(universe):,} SKUs across {len(retailer_labels)} retailers")
    if "oem_catalog_db" in sources:
        print(f"  in OEM:          {len(universe & in_oem):,}")
        print(f"  not in OEM:      {len(retailers_only_no_oem):,}")
    print("Coverage histogram (SKUs by # of retailers carrying them):")
    for k in sorted(coverage_histogram):
        print(f"  {k} retailer(s): {coverage_histogram[k]:>7,}")


if __name__ == "__main__":
    main()
