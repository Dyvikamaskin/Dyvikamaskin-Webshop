"""
Extract assembly groups + parts from a Wacker Neuson parts-book PDF.

Two layouts are supported:

  ALFIS layout (older alfis.eu downloads, e.g. BPU/DPU "_Parts_Manual.pdf"):
    - Front matter then strict diagram/parts alternation.
    - 4 languages stacked vertically in description cells.
    - Bold part numbers mark recommended spares.

  SP layout (factory exports from shop.wackerneuson.com,
  e.g. "SP-DPU-6555Hec-US-100-Q4-5100004399.pdf"):
    - Cover page contains "Material Number" / "Version" labels.
    - 4-language section title block sits top-right of every section page
      (Arial-BoldMT size 10, x>440, y<100).
    - Parts table column headers: 'Pos.' / 'Item' or 'Ref.' (DE/EN stacked),
      'Artikel Nr.' / 'Part No.' or 'Item no.', 'Qty.' or 'Pc.', 'Unit',
      'Beschreibung' / 'Description', and Abm./Drehm./Norm at far-right.
    - Recommended spares are NOT marked in this layout (no bold).
    - Diagram pages have the section title block but no 'Pos.' header.

Output JSON shape:
  {
    "model_name": ...,
    "doc_number": ...,
    "doc_issue": ...,
    "page_count": ...,
    "groups": [
      {
        "group_seq": 1,
        "group_name": "Vibration Plate",
        "diagram_page": 10,
        "parts": [
          {"ref_pos": "6", "part_number": "5100010503", "qty": 1,
           "description": "Profiled joint",
           "measurement": "", "torque": "", "is_recommended": false}
        ]
      }
    ]
  }
"""
import fitz
import re
import sys
import json


PART_NO_RE = re.compile(r"^\d{7,10}$|^0\d{6,9}$")
REF_RE = re.compile(r"^\d+[a-z]?$")
QTY_RE = re.compile(r"^\d+$")


def _spans(page):
    spans = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                t = span["text"].strip()
                if not t:
                    continue
                spans.append({
                    "x": span["bbox"][0],
                    "y": span["bbox"][1],
                    "text": t,
                    "font": span["font"],
                    "flags": span["flags"],
                    "size": span["size"],
                })
    return spans


# ---------------------------------------------------------------- layout detect

def detect_layout(doc):
    """Return 'sp' or 'alfis' based on cover-page markers."""
    text = doc[0].get_text("text") + "\n" + doc[1].get_text("text")
    if "Material Number" in text and "Version" in text:
        return "sp"
    return "alfis"


# =============================================================================
# ALFIS layout (original implementation)
# =============================================================================

def classify_alfis(page):
    text = page.get_text("text")
    n_blocks = len(page.get_text("blocks"))
    n_images = len(page.get_images())
    if n_blocks == 0 and n_images >= 1:
        return "blank"
    if "Table of Contents" in text or "Inhaltsverzeichnis" in text:
        return "toc"
    if "Ref." in text and "Part No." in text:
        return "parts"
    if n_images >= 1 and n_blocks <= 8:
        return "diagram"
    return "other"


def section_name_alfis(page):
    bolds = [s for s in _spans(page)
             if "Bold" in s["font"] and s["size"] >= 11 and s["y"] < 140]
    if not bolds:
        return ""
    bolds.sort(key=lambda s: (s["y"], s["x"]))
    for s in bolds:
        if not re.match(r"^[A-Z]{2,4}\s?\d", s["text"]):
            return s["text"]
    return bolds[0]["text"]


def parse_parts_page_alfis(page):
    spans = _spans(page)
    spans.sort(key=lambda s: (round(s["y"], 1), s["x"]))
    data = [s for s in spans if s["y"] > 165]
    parts = []
    anchors = [s for s in data
               if 60 < s["x"] < 100 and PART_NO_RE.match(s["text"])]
    for a in anchors:
        ya = a["y"]
        row = [s for s in data if ya - 12 < s["y"] < ya + 22]

        def first(predicate):
            cand = [s for s in row if predicate(s)]
            cand.sort(key=lambda s: s["y"])
            return cand[0]["text"] if cand else ""

        ref_pos = first(lambda s: 40 < s["x"] < 70 and s["x"] < a["x"] - 3 and REF_RE.match(s["text"]))
        qty = first(lambda s: 100 < s["x"] < 120 and QTY_RE.match(s["text"]))
        en_desc = first(lambda s: 120 < s["x"] < 280)

        meas_torque = [(s["y"], s["text"]) for s in row if 425 < s["x"] < 500]
        measurement = ""
        torque = ""
        for _, t in meas_torque:
            if any(k in t for k in ("Nm", "ft.lbs", "ft lbs", "Nm/")):
                torque = t
            else:
                if not measurement:
                    measurement = t

        is_recommended = "Bold" in a["font"] or bool(a["flags"] & 16)
        qty_int = int(qty) if qty and qty.isdigit() else None
        parts.append({
            "ref_pos": ref_pos,
            "part_number": a["text"],
            "qty": qty_int,
            "description": en_desc,
            "measurement": measurement,
            "torque": torque,
            "is_recommended": is_recommended,
        })
    return parts


def extract_alfis(doc):
    classes = [classify_alfis(p) for p in doc]
    start = None
    for i, c in enumerate(classes):
        if c == "diagram":
            start = i + 1
            break
    if start is None:
        raise RuntimeError("ALFIS: no diagram pages found")

    groups = []
    seq = 0
    i = start
    while i <= len(doc):
        c = classes[i - 1]
        if c != "diagram":
            i += 1
            continue
        diagram_page = i
        name = section_name_alfis(doc[i - 1])
        parts = []
        j = i + 1
        while j <= len(doc) and classes[j - 1] == "parts":
            parts.extend(parse_parts_page_alfis(doc[j - 1]))
            j += 1
        if parts or name:
            seq += 1
            groups.append({
                "group_seq": seq,
                "group_name": name or f"(section p{i})",
                "diagram_page": diagram_page,
                "parts": parts,
            })
        i = j if j > i + 1 else i + 1
    return groups


# =============================================================================
# SP layout (shop.wackerneuson.com SAP exports)
# =============================================================================

# x-coordinates verified on SP-DPU-6555Hec-US-100-Q4-5100004399.pdf and
# SP-DPU110Lekc970-100-Q4-5100034515.pdf.
SP_REF_X = (45, 70)        # ref-pos column (x~52.9)
SP_PART_X = (70, 100)      # part-no column (x~76.5)
SP_QTY_X = (120, 145)      # qty column (x~130.1)
SP_DE_X = (175, 280)       # German + Spanish descriptions (x~181.6)
SP_EN_X = (300, 425)       # English + French descriptions (x~310.3)
SP_RIGHT_X = (430, 490)    # measurement / torque (x~438.9)

# ---- "Compact" SP sub-layout (landscape, 842x595) -------------------------
# Used for rollers (RC50, RC110, RD*), buggies (CB250), trailers (Anhänger),
# battery packs (ACBe, AT24e, AT36e), drills (BOB, BOC, BH*).
# Column layout verified on SP__RC50_100__T1_5100047388.pdf p41 and
# SP__BOB5_100__T1_5100069471.pdf p11.
SPC_REF_X = (20, 45)        # ref-pos column (x~26.9)
SPC_PART_X = (50, 75)       # part-no column (x~58.6)
SPC_DE_X = (105, 270)       # German description (x~113.9)
SPC_EN_X = (270, 425)       # English description (x~272.1)
SPC_FR_X = (425, 580)       # French description (x~430.3)
SPC_INFO_X = (580, 760)     # Info column (x~588.4)
SPC_QTY_X = (755, 790)      # qty column (x~762.4)
SPC_UNIT_X = (790, 820)     # unit column (x~794.1)


def is_compact_sp(page):
    """Compact SP pages are landscape (~842 wide, ~595 tall)."""
    return page.rect.width > 700


def classify_sp(page):
    spans = _spans(page)
    text = page.get_text("text")
    # TOC pages have multiple "...." dot-leader lines and the word
    # "Inhaltsverzeichnis" / "Table of contents".
    if any(k in text for k in (
        "Inhaltsverzeichnis", "Table of contents",
        "Allgemeine Informationen", "General information about spare parts",
        "Información general", "Informations générales",
    )):
        return "front"
    # ---- Compact SP layout (landscape) ----
    # Parts page: bold 'Item' header at x~26.9, y~76; 'Item no.' at x~58.6.
    if is_compact_sp(page):
        has_compact_header = any(
            s["text"] in ("Item", "Pos.") and "Bold" in s["font"]
            and SPC_REF_X[0] < s["x"] < SPC_REF_X[1] and 65 < s["y"] < 90
            for s in spans
        )
        if has_compact_header:
            return "parts"
        # Diagram-only page: 2-3 bold title lines y<70, plus an image.
        title_lines = [
            s for s in spans
            if "Bold" in s["font"] and 9 <= s["size"] <= 11 and s["y"] < 70
        ]
        if len(title_lines) >= 2:
            return "diagram"
        return "other"
    # ---- Standard (portrait) SP layout ----
    # 'Pos.' or 'Item' bold span at x~52.9, y~116 pins this as a parts page.
    has_header = any(
        s["text"] in ("Pos.", "Item") and "Bold" in s["font"]
        and SP_REF_X[0] < s["x"] < SP_REF_X[1] and 110 < s["y"] < 130
        for s in spans
    )
    if has_header:
        return "parts"
    # Diagram page: 4-language Arial-Bold title block at top, y<100.
    # Title sits at left on diagram pages, right on parts pages.
    title_lines = [
        s for s in spans
        if "Bold" in s["font"] and 9 <= s["size"] <= 11 and s["y"] < 100
    ]
    if len(title_lines) >= 2:
        return "diagram"
    return "other"


def section_name_sp(page):
    """SP title block: 4 bold lines at the top of the page (y < 100).
    Standard (portrait): on diagram pages the block sits at LEFT (x ~ 54); on
    parts pages it sits at RIGHT (x > 440). Order: DE, EN, ES, FR — take #2.
    Compact (landscape): block sits at LEFT (x ~ 28), order DE, EN, FR
    (only 3 lines, no ES). Title lines are y in 30-65."""
    spans = _spans(page)
    if is_compact_sp(page):
        title = [s for s in spans
                 if "Bold" in s["font"] and 9 <= s["size"] <= 11
                 and s["y"] < 70 and s["x"] < 100]
        title.sort(key=lambda s: s["y"])
        if len(title) >= 2:
            return title[1]["text"]
        return title[0]["text"] if title else ""
    title = [s for s in spans
             if "Bold" in s["font"] and 9 <= s["size"] <= 11 and s["y"] < 100]
    title.sort(key=lambda s: s["y"])
    if len(title) >= 2:
        return title[1]["text"]
    return title[0]["text"] if title else ""


def parse_parts_page_sp(page):
    spans = _spans(page)
    # Data starts after the column header band (y ~ 105-145).
    data = [s for s in spans if s["y"] > 145 and s["y"] < 780]

    # Anchor on part-numbers in the Artikel-Nr. column.
    anchors = [s for s in data
               if SP_PART_X[0] < s["x"] < SP_PART_X[1] and PART_NO_RE.match(s["text"])]
    anchors.sort(key=lambda s: s["y"])

    parts = []
    for idx, a in enumerate(anchors):
        ya = a["y"]
        # Row spans from the part-no baseline down to just above the next
        # part-no. DE/ES sit on the same line as part-no; EN/FR could be on
        # the same line or one line below; measurement/torque +- a few pts.
        next_y = anchors[idx + 1]["y"] if idx + 1 < len(anchors) else ya + 25
        # Use a ~20pt window — rows are ~22pt apart in this layout.
        row = [s for s in data if ya - 6 <= s["y"] < min(ya + 20, next_y - 1)]

        def first_in(xlo, xhi, predicate=None):
            cand = [s for s in row if xlo < s["x"] < xhi]
            if predicate:
                cand = [s for s in cand if predicate(s)]
            cand.sort(key=lambda s: s["y"])
            return cand[0]["text"] if cand else ""

        ref_pos = first_in(*SP_REF_X, predicate=lambda s: REF_RE.match(s["text"]))
        qty = first_in(*SP_QTY_X, predicate=lambda s: QTY_RE.match(s["text"]))
        # EN description: first (top-most) span in the EN/FR column.
        en_desc = first_in(*SP_EN_X)

        # Measurement vs torque — split by whether the span contains a
        # torque marker ("Nm", "ft.lbs"). Both columns share x~438.9 but
        # appear on adjacent y rows.
        right = [(s["y"], s["text"]) for s in row
                 if SP_RIGHT_X[0] < s["x"] < SP_RIGHT_X[1]]
        right.sort()
        measurement = ""
        torque = ""
        for _, t in right:
            if any(k in t for k in ("Nm", "ft.lbs", "ft lbs", "Nm/")):
                if not torque:
                    torque = t
            else:
                if not measurement:
                    measurement = t

        # SP layout: no bold-part-no convention. Leave recommended off.
        is_recommended = "Bold" in a["font"] or bool(a["flags"] & 16)
        qty_int = int(qty) if qty and qty.isdigit() else None
        parts.append({
            "ref_pos": ref_pos,
            "part_number": a["text"],
            "qty": qty_int,
            "description": en_desc,
            "measurement": measurement,
            "torque": torque,
            "is_recommended": is_recommended,
        })
    return parts


def parse_parts_page_sp_compact(page):
    """Parse a compact-SP parts page (landscape 842x595).
    Columns:
      Item     x~26.9
      Item no. x~58.6
      DE desc  x~113.9
      EN desc  x~272.1
      FR desc  x~430.3
      Info     x~588.4
      Pc.      x~762.4
      Unit     x~794.1
    Rows ~12pt apart, starting y~88.3. Header row at y~76.3.
    """
    spans = _spans(page)
    data = [s for s in spans if s["y"] > 82 and s["y"] < 555]

    anchors = [s for s in data
               if SPC_PART_X[0] < s["x"] < SPC_PART_X[1] and PART_NO_RE.match(s["text"])]
    anchors.sort(key=lambda s: s["y"])

    parts = []
    for idx, a in enumerate(anchors):
        ya = a["y"]
        next_y = anchors[idx + 1]["y"] if idx + 1 < len(anchors) else ya + 15
        row = [s for s in data if ya - 3 <= s["y"] < min(ya + 12, next_y - 1)]

        def first_in(xlo, xhi, predicate=None):
            cand = [s for s in row if xlo < s["x"] < xhi]
            if predicate:
                cand = [s for s in cand if predicate(s)]
            cand.sort(key=lambda s: s["y"])
            return cand[0]["text"] if cand else ""

        ref_pos = first_in(*SPC_REF_X, predicate=lambda s: REF_RE.match(s["text"]))
        qty = first_in(*SPC_QTY_X, predicate=lambda s: QTY_RE.match(s["text"]))
        en_desc = first_in(*SPC_EN_X)
        info = first_in(*SPC_INFO_X)

        # Compact layout has no measurement/torque column in the same sense;
        # the right-side "Information" column holds notes like serial ranges.
        # Detect torque-looking strings anywhere in the row.
        measurement = ""
        torque = ""
        if info and any(k in info for k in ("Nm", "ft.lbs", "ft lbs", "Nm/")):
            torque = info
            info = ""

        is_recommended = "Bold" in a["font"] or bool(a["flags"] & 16)
        qty_int = int(qty) if qty and qty.isdigit() else None
        parts.append({
            "ref_pos": ref_pos,
            "part_number": a["text"],
            "qty": qty_int,
            "description": en_desc,
            "measurement": measurement or info,
            "torque": torque,
            "is_recommended": is_recommended,
        })
    return parts


def extract_sp(doc):
    classes = [classify_sp(p) for p in doc]
    # Pick the parser based on the first parts page we see.
    compact = any(is_compact_sp(doc[i]) for i, c in enumerate(classes) if c == "parts")
    parser = parse_parts_page_sp_compact if compact else parse_parts_page_sp
    # First diagram page is where actual content begins.
    start = None
    for i, c in enumerate(classes):
        if c == "diagram":
            # Make sure the next page is a parts page — skip false positives
            # (e.g. a single illustration on a "Notiz" placeholder).
            if i + 1 < len(classes) and classes[i + 1] == "parts":
                start = i + 1
                break
    if start is None:
        raise RuntimeError("SP: no diagram+parts pair found")

    groups = []
    seq = 0
    i = start  # 1-based
    while i <= len(doc):
        c = classes[i - 1]
        if c != "diagram":
            i += 1
            continue
        diagram_page = i
        name = section_name_sp(doc[i - 1])
        parts = []
        j = i + 1
        while j <= len(doc) and classes[j - 1] == "parts":
            parts.extend(parser(doc[j - 1]))
            j += 1
        if parts or name:
            seq += 1
            groups.append({
                "group_seq": seq,
                "group_name": name or f"(section p{i})",
                "diagram_page": diagram_page,
                "parts": parts,
            })
        i = j if j > i + 1 else i + 1
    return groups


# =============================================================================
# Cover-page metadata + dispatch
# =============================================================================

def cover_metadata(doc, layout):
    """Pull doc_number / doc_issue / model_name from the cover."""
    doc_number = ""
    doc_issue = ""
    model_name = ""

    if layout == "sp":
        # SP cover has labelled fields "Type", "Material Number", "Version".
        text = doc[0].get_text("text")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        for idx, ln in enumerate(lines):
            if ln == "Type" and idx + 1 < len(lines):
                model_name = lines[idx + 1]
            elif ln == "Material Number" and idx + 1 < len(lines):
                doc_number = lines[idx + 1]
            elif ln == "Version" and idx + 1 < len(lines):
                doc_issue = lines[idx + 1]
        return model_name, doc_number, doc_issue

    # ALFIS cover heuristics (original).
    cover = _spans(doc[0])
    cover.sort(key=lambda s: s["y"])
    for s in cover:
        if re.match(r"^\d{7,10}(\s+\d{2,3})?$", s["text"]):
            doc_number = s["text"].split()[0]
        elif re.match(r"^\d{2}\.\d{4}$", s["text"]):
            doc_issue = s["text"]
    return model_name, doc_number, doc_issue


def extract(pdf_path, model_name=None, category="Reversible Plate"):
    doc = fitz.open(pdf_path)
    layout = detect_layout(doc)
    cover_model, doc_number, doc_issue = cover_metadata(doc, layout)
    if not model_name:
        model_name = cover_model

    if layout == "sp":
        groups = extract_sp(doc)
    else:
        groups = extract_alfis(doc)

    return {
        "model_name": model_name or "",
        "doc_number": doc_number,
        "doc_issue": doc_issue,
        "page_count": len(doc),
        "category": category,
        "layout": layout,
        "groups": groups,
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    out = extract(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else None)
    if "--summary" in sys.argv:
        print(f"Layout: {out['layout']}")
        print(f"Model: {out['model_name']}  doc={out['doc_number']}  {out['doc_issue']}")
        print(f"Pages: {out['page_count']}, groups: {len(out['groups'])}")
        total_parts = sum(len(g['parts']) for g in out['groups'])
        recommended = sum(1 for g in out['groups'] for p in g['parts'] if p['is_recommended'])
        print(f"Parts: {total_parts}, recommended: {recommended}")
        print("\nFirst 10 groups:")
        for g in out['groups'][:10]:
            print(f"  seq={g['group_seq']:>3} p{g['diagram_page']:>3}  "
                  f"{len(g['parts']):>3} parts  | {g['group_name']}")
            for p in g['parts'][:3]:
                star = "*" if p['is_recommended'] else " "
                print(f"    {star} ref={p['ref_pos']:<4} #{p['part_number']:<11} "
                      f"q={p['qty']!s:<4}  {p['description'][:50]}")
    else:
        print(json.dumps(out, ensure_ascii=False, indent=2))
