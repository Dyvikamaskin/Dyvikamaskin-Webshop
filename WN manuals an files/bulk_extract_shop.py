"""
Bulk-extract parts data from every PDF in pdfs_shop/.

Writes one JSON per PDF to extracts_shop/<pdf_basename>.json and a final
bulk_extract_report.json with counts per layout, per-PDF status, top failure
classes, total parts, and runtime.

Does NOT touch wn_parts.sqlite — extraction only.

Usage:
  python bulk_extract_shop.py                 # full run
  python bulk_extract_shop.py --limit 5       # smoke test
  python bulk_extract_shop.py --only file.pdf # single PDF (debug)
  python bulk_extract_shop.py --files a.pdf b.pdf  # explicit list

Idempotent / resumable: skips PDFs that already have a non-empty JSON output.
"""
import argparse
import json
import os
import re
import sys
import time
import traceback
from collections import Counter

from extract_wn_parts import extract


PDFS_DIR = "pdfs_shop"
OUT_DIR = "extracts_shop"
CAT_PATH = "wn_catalogue.json"
REPORT_PATH = "bulk_extract_report.json"


# -- filename parsing ----------------------------------------------------------

# SP factory filename:
#   SP__<MODEL>_<rev>_<...region/qtr>_<doc_number>.pdf
# Examples:
#   SP__DPU6555Hec_100_Q4_5100004399.pdf
#   SP__RD45-140c DPF_100__T1_5100055780.pdf
#   SP__CB250 1Ph Ein 63A Aus_100__T1_5100069650.pdf
#   SP__Anhänger CB250_100__T1_5100080500.pdf
SP_RE = re.compile(
    r"^SP__(?P<model>.+?)_(?P<rev>\d{3})_+(?P<region>[A-Z0-9]+)_(?P<doc>\d{6,12})"
    r"(?:_\d+_?)?\.pdf$",
    re.IGNORECASE,
)

# Short-form filename — <code>_Rev<NNN>.pdf, <code>.pdf, or with an extra
# language/region suffix like 0630000_Rev100jp.pdf, 5100031221_Rev100_D2.pdf.
SHORT_RE = re.compile(
    r"^(?P<code>\d{6,12})(?:[_-]Rev\d{3}(?:[_-]?[A-Za-z0-9]+)?)?\.pdf$",
    re.IGNORECASE,
)

# Loose SP variant — some shop files like 5100079595_100__D2.pdf use the
# doc-number as the leading token and no SP__ prefix.
LOOSE_RE = re.compile(
    r"^(?P<doc>\d{6,12})_(?P<rev>\d{3})_+(?P<region>[A-Z0-9]+)\.pdf$",
    re.IGNORECASE,
)


def slugify(s):
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"[^A-Za-z0-9._-]", "", s)
    return s or "unknown"


def parse_filename(name, catalogue_by_code, catalogue_by_doc):
    """Return dict: {model_slug, display_name, category, doc_hint, kind}."""
    m = SP_RE.match(name)
    if m:
        model_raw = m.group("model")
        doc = m.group("doc")
        slug = slugify(model_raw)
        # Catalogue enrichment from doc number (parts manual material no.).
        cat_hit = catalogue_by_doc.get(doc)
        category = "/".join(cat_hit["category_path"]) if cat_hit else ""
        display = cat_hit["name"] if cat_hit else model_raw
        return {
            "model_slug": slug,
            "display_name": display,
            "category": category,
            "doc_hint": doc,
            "kind": "sp",
        }
    m = SHORT_RE.match(name)
    if m:
        code = m.group("code")
        # Try direct machine-code, then doc-number / parts-manual-code lookup.
        hit = catalogue_by_code.get(code) or catalogue_by_doc.get(code)
        if hit:
            return {
                "model_slug": slugify(hit["name"].split("_")[0]),
                "display_name": hit["name"],
                "category": "/".join(hit["category_path"]),
                "doc_hint": code,
                "kind": "short",
            }
        return {
            "model_slug": code,
            "display_name": "",
            "category": "",
            "doc_hint": code,
            "kind": "short-unmatched",
        }
    m = LOOSE_RE.match(name)
    if m:
        doc = m.group("doc")
        cat_hit = catalogue_by_doc.get(doc)
        return {
            "model_slug": doc,
            "display_name": cat_hit["name"] if cat_hit else "",
            "category": "/".join(cat_hit["category_path"]) if cat_hit else "",
            "doc_hint": doc,
            "kind": "loose",
        }
    return {
        "model_slug": slugify(name.rsplit(".", 1)[0]),
        "display_name": "",
        "category": "",
        "doc_hint": "",
        "kind": "unknown-pattern",
    }


def build_catalogue_indexes(path):
    """Return (by_machine_code, by_doc_or_parts_manual_filename_code).

    Some PDFs use the machine code as filename; many short-form names use the
    parts-manual material number embedded in the parts_manuals[].filename or
    .url. We index both so either lookup hits."""
    by_code = {}
    by_doc = {}
    if not os.path.exists(path):
        return by_code, by_doc
    cat = json.load(open(path, encoding="utf-8"))
    for m in cat.get("machines", []):
        by_code[m["code"]] = m
        for pm in m.get("parts_manuals", []) or []:
            fn = pm.get("filename", "")
            # SP__..._<docnum>.pdf  → docnum
            mm = SP_RE.match(fn)
            if mm:
                by_doc[mm.group("doc")] = m
            mm = SHORT_RE.match(fn)
            if mm:
                by_doc[mm.group("code")] = m
                # Also index without leading zeros stripped vs preserved.
                by_doc[mm.group("code").lstrip("0")] = m
            mm = LOOSE_RE.match(fn)
            if mm:
                by_doc[mm.group("doc")] = m
    return by_code, by_doc


# -- main ----------------------------------------------------------------------

def classify_error(exc):
    msg = str(exc) or exc.__class__.__name__
    if "no diagram pages" in msg or "no diagram+parts" in msg:
        return "no-diagram-or-parts"
    if "MuPDF" in msg or "fitz" in msg.lower() or "cannot open" in msg.lower():
        return "pdf-open-error"
    if isinstance(exc, MemoryError):
        return "memory"
    return exc.__class__.__name__


def process_one(pdf_path, parsed, out_dir, force=False):
    base = os.path.basename(pdf_path)
    out_path = os.path.join(out_dir, base + ".json")
    if (not force) and os.path.exists(out_path) and os.path.getsize(out_path) > 8:
        return {"status": "skipped", "out": out_path}

    t0 = time.time()
    try:
        result = extract(
            pdf_path,
            model_name=parsed["display_name"] or None,
            category=parsed["category"] or "Uncategorised",
        )
    except Exception as exc:
        return {
            "status": "failed",
            "error_class": classify_error(exc),
            "error": f"{exc.__class__.__name__}: {exc}",
            "traceback": traceback.format_exc(),
            "runtime_s": round(time.time() - t0, 2),
        }

    # Inject filename-derived metadata.
    result["source_pdf"] = base
    result["filename_model_slug"] = parsed["model_slug"]
    result["filename_kind"] = parsed["kind"]
    if parsed["category"] and not result.get("category"):
        result["category"] = parsed["category"]

    n_groups = len(result.get("groups", []))
    n_parts = sum(len(g.get("parts", [])) for g in result.get("groups", []))
    n_recommended = sum(
        1 for g in result.get("groups", []) for p in g.get("parts", [])
        if p.get("is_recommended")
    )

    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    os.replace(tmp, out_path)

    return {
        "status": "ok",
        "layout": result.get("layout"),
        "groups": n_groups,
        "parts": n_parts,
        "recommended": n_recommended,
        "page_count": result.get("page_count"),
        "out": out_path,
        "runtime_s": round(time.time() - t0, 2),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs-dir", default=PDFS_DIR)
    ap.add_argument("--out-dir", default=OUT_DIR)
    ap.add_argument("--catalogue", default=CAT_PATH)
    ap.add_argument("--report", default=REPORT_PATH)
    ap.add_argument("--limit", type=int, default=0,
                    help="Process at most N PDFs (after sorting).")
    ap.add_argument("--only", default=None, help="Process only this single basename.")
    ap.add_argument("--files", nargs="+", default=None,
                    help="Explicit list of basenames to process.")
    ap.add_argument("--force", action="store_true",
                    help="Re-extract even if output JSON already exists.")
    args = ap.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")

    os.makedirs(args.out_dir, exist_ok=True)
    by_code, by_doc = build_catalogue_indexes(args.catalogue)
    print(f"[cat] machines={len(by_code)}  doc_index={len(by_doc)}", flush=True)

    all_pdfs = sorted(
        f for f in os.listdir(args.pdfs_dir) if f.lower().endswith(".pdf")
    )
    if args.only:
        all_pdfs = [args.only] if args.only in all_pdfs else []
    elif args.files:
        all_pdfs = [f for f in args.files if f in all_pdfs]
    if args.limit:
        all_pdfs = all_pdfs[: args.limit]
    print(f"[run] {len(all_pdfs)} PDFs queued from {args.pdfs_dir}", flush=True)

    layout_counts = Counter()
    status_counts = Counter()
    kind_counts = Counter()
    error_classes = Counter()
    per_pdf = []
    total_parts = 0
    total_groups = 0
    started = time.time()

    for i, name in enumerate(all_pdfs, 1):
        path = os.path.join(args.pdfs_dir, name)
        parsed = parse_filename(name, by_code, by_doc)
        kind_counts[parsed["kind"]] += 1
        res = process_one(path, parsed, args.out_dir, force=args.force)
        status = res["status"]
        status_counts[status] += 1

        if status == "ok":
            layout_counts[res["layout"]] += 1
            total_parts += res["parts"]
            total_groups += res["groups"]
            print(
                f"[{i:>3}/{len(all_pdfs)}] OK  {name}  "
                f"layout={res['layout']:<5} parts={res['parts']:>4}  "
                f"groups={res['groups']:>3}  pages={res['page_count']:>3}  "
                f"slug={parsed['model_slug']}",
                flush=True,
            )
        elif status == "skipped":
            print(f"[{i:>3}/{len(all_pdfs)}] SKIP {name}  (existing JSON)", flush=True)
        else:
            error_classes[res["error_class"]] += 1
            print(
                f"[{i:>3}/{len(all_pdfs)}] FAIL {name}  "
                f"[{res['error_class']}] {res['error']}",
                flush=True,
            )

        per_pdf.append({
            "pdf": name,
            "filename_kind": parsed["kind"],
            "model_slug": parsed["model_slug"],
            "display_name": parsed["display_name"],
            "category": parsed["category"],
            **{k: v for k, v in res.items() if k != "traceback"},
        })

    elapsed = time.time() - started
    report = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S",
                                    time.localtime(started)),
        "runtime_s": round(elapsed, 1),
        "pdfs_total": len(all_pdfs),
        "status_counts": dict(status_counts),
        "layout_counts": dict(layout_counts),
        "filename_kind_counts": dict(kind_counts),
        "error_classes": dict(error_classes),
        "top_failures": [
            {"pdf": x["pdf"], "error_class": x.get("error_class"),
             "error": x.get("error")}
            for x in per_pdf if x["status"] == "failed"
        ][:25],
        "total_parts_extracted": total_parts,
        "total_groups_extracted": total_groups,
        "per_pdf": per_pdf,
    }
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(
        f"\n[done] {len(all_pdfs)} PDFs in {elapsed:.1f}s  "
        f"status={dict(status_counts)}  "
        f"layouts={dict(layout_counts)}  parts={total_parts}",
        flush=True,
    )
    print(f"[done] report -> {args.report}", flush=True)


if __name__ == "__main__":
    main()
