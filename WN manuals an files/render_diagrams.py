"""
Render diagram pages to PNG for the newly ingested models.

For each (model_id, diagram_page) row in assembly_groups, rasterize the
matching PDF page at 150 DPI and write to drawings/<slug>_pNNN.png.
"""
import os
import sys
import sqlite3
import fitz

sys.stdout.reconfigure(encoding="utf-8")

JOBS = [
    # (model_id, source_pdf, slug)
    (16, "SP-DPU-6555Hec-US-100-Q4-5100004399.pdf", "dpu_6555hec_us"),
    (17, "SP-DPU110Lekc970-100-Q4-5100034515.pdf", "dpu_110lekc970"),
]

DPI = 150
ZOOM = DPI / 72.0
MAT = fitz.Matrix(ZOOM, ZOOM)

os.makedirs("drawings", exist_ok=True)
con = sqlite3.connect("wn_parts.sqlite")

for model_id, pdf, slug in JOBS:
    rows = con.execute(
        "SELECT DISTINCT diagram_page FROM assembly_groups WHERE model_id = ? ORDER BY diagram_page",
        (model_id,),
    ).fetchall()
    print(f"model {model_id} ({slug}): {len(rows)} unique diagram pages")
    doc = fitz.open(pdf)
    written = 0
    for (dp,) in rows:
        # diagram_page is 1-based in DB; PyMuPDF uses 0-based.
        page = doc[dp - 1]
        pm = page.get_pixmap(matrix=MAT, alpha=False)
        out = f"drawings/{slug}_p{dp:03d}.png"
        pm.save(out)
        written += 1
    print(f"  wrote {written} PNGs to drawings/{slug}_p*.png")
    doc.close()

con.close()
print("done.")
