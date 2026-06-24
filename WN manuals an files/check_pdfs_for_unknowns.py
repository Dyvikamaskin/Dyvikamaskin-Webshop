"""
Extract all part numbers from two user-provided PDFs and cross-check
against the 80 'unknown' 5xxx stocked SKUs.

PDFs:
  C:/Users/Ventura AI/Downloads/0610344-Rev101.pdf      (DPU 100-70, 90p)
  C:/Users/Ventura AI/Downloads/5000008900-Rev101.pdf  (machine 5000008900, 24p)

Outputs:
  pdfcheck_<basename>.txt          — full extracted text per PDF
  pdfcheck_summary.json            — which unknowns found where, with context
  pdfcheck_summary.md              — human-readable report
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

import fitz  # PyMuPDF

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

PDFS = [
    r"C:\Users\Ventura AI\Downloads\0610344-Rev101.pdf",
    r"C:\Users\Ventura AI\Downloads\5000008900-Rev101.pdf",
]


# Load the 80 unknown 5xxx SKUs and their descriptions
unknowns = {}
with open(os.path.join(HERE, "unknowns_5xxx.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        unknowns[r["sku_5xxx"]] = r["Beskrivelse"]
unknown_set = set(unknowns.keys())
print(f"Loaded {len(unknown_set)} unknown 5xxx SKUs")


SKU_RE = re.compile(r"\b(?:0\d{6}|[15]\d{9})\b")  # legacy 0xxxxxx OR 10-digit 1xxx/5xxx


def extract_pdf(path):
    print(f"\nExtracting {path} ...", flush=True)
    pages = []
    doc = fitz.open(path)
    for i, page in enumerate(doc, 1):
        try:
            txt = page.get_text() or ""
        except Exception as e:
            txt = f"<error extracting page {i}: {e}>"
        pages.append({"page": i, "text": txt})
        if i % 20 == 0:
            print(f"  page {i}/{doc.page_count}", flush=True)
    doc.close()
    print(f"  done: {len(pages)} pages", flush=True)
    return pages


report = {}
for pdf_path in PDFS:
    basename = os.path.basename(pdf_path)
    pages = extract_pdf(pdf_path)

    # Save the raw text for inspection
    txt_path = os.path.join(HERE, f"pdfcheck_{basename.replace('.pdf', '.txt')}")
    with open(txt_path, "w", encoding="utf-8") as f:
        for p in pages:
            f.write(f"\n===== PAGE {p['page']} =====\n")
            f.write(p["text"])
    print(f"  Wrote {txt_path}")

    # Scan for ALL part-shape numbers
    all_skus = Counter()
    sku_pages = defaultdict(set)
    for p in pages:
        found = SKU_RE.findall(p["text"])
        for s in found:
            all_skus[s] += 1
            sku_pages[s].add(p["page"])

    # Which unknowns are present?
    unknowns_found = {s for s in unknown_set if s in all_skus}

    # Capture surrounding context for each unknown found
    contexts = {}
    for s in unknowns_found:
        for p in pages:
            if s in p["text"]:
                idx = p["text"].find(s)
                ctx = p["text"][max(0, idx - 100): idx + 200].replace("\n", " | ")
                contexts.setdefault(s, []).append({"page": p["page"], "context": ctx})
                break  # one context per unknown is enough

    # Title heuristic — first page
    title = pages[0]["text"][:400].replace("\n", " | ").strip() if pages else ""

    report[basename] = {
        "title_first_400_chars": title,
        "pages": len(pages),
        "total_sku_shape_hits": sum(all_skus.values()),
        "distinct_skus_in_pdf": len(all_skus),
        "unknowns_found": sorted(unknowns_found),
        "unknowns_found_count": len(unknowns_found),
        "contexts": contexts,
        "sample_distinct_skus": sorted(all_skus.keys())[:25],
    }

    print(f"\n  {basename}: {len(all_skus):,} distinct SKUs, "
          f"{len(unknowns_found)}/{len(unknown_set)} unknowns found")
    for s in sorted(unknowns_found):
        print(f"    ✓ {s}  ({unknowns[s]!r})")


# Aggregate
all_unknowns_found_in_either = set()
for b, r in report.items():
    all_unknowns_found_in_either |= set(r["unknowns_found"])
print(f"\n=== AGGREGATE ===")
print(f"Unknowns found in EITHER PDF: {len(all_unknowns_found_in_either)} / {len(unknown_set)}")
print(f"Unknowns still NOT in these PDFs: {len(unknown_set - all_unknowns_found_in_either)}")

# Markdown summary
md = ["# PDF check — unknown 5xxx stocked SKUs vs user PDFs\n"]
md.append(f"- Unknowns total: **{len(unknown_set)}**")
md.append(f"- Found in either PDF: **{len(all_unknowns_found_in_either)}**")
md.append(f"- Still missing: **{len(unknown_set - all_unknowns_found_in_either)}**\n")
for b, r in report.items():
    md.append(f"## `{b}` ({r['pages']} pages)\n")
    md.append(f"_First 400 chars of page 1:_ `{r['title_first_400_chars'][:200]}…`\n")
    md.append(f"- Distinct SKU-shape numbers in PDF: **{r['distinct_skus_in_pdf']:,}**")
    md.append(f"- Total SKU-shape hits: **{r['total_sku_shape_hits']:,}**")
    md.append(f"- Unknowns found here: **{r['unknowns_found_count']}**\n")
    if r["unknowns_found"]:
        md.append("| SKU | Inventory description | Page | Context |")
        md.append("|---|---|---:|---|")
        for s in r["unknowns_found"]:
            ctx_list = r["contexts"].get(s, [])
            ctx0 = ctx_list[0] if ctx_list else {"page": "?", "context": ""}
            md.append(f"| `{s}` | {unknowns.get(s, '')} | {ctx0['page']} | `{ctx0['context'][:150]}` |")
        md.append("")

with open(os.path.join(HERE, "pdfcheck_summary.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(md))
with open(os.path.join(HERE, "pdfcheck_summary.json"), "w", encoding="utf-8") as f:
    json.dump({"unknown_count": len(unknown_set),
               "found_in_either": sorted(all_unknowns_found_in_either),
               "still_missing": sorted(unknown_set - all_unknowns_found_in_either),
               "per_pdf": report}, f, ensure_ascii=False, indent=2)
print(f"\nWrote pdfcheck_summary.md and pdfcheck_summary.json")
