"""
Ingest extracted SP-layout WN parts data into wn_parts.sqlite.

Usage:
  python ingest_sp.py <pdf> <slug> [--category "Reversible Plate"] [--commit]

Idempotent-ish: if a model with the same source_pdf exists, refuses to insert
(re-run only after a backup + DELETE).
"""
import os
import sys
import json
import sqlite3
import argparse

sys.stdout.reconfigure(encoding="utf-8")

from extract_wn_parts import extract


def ingest(pdf_path, slug, category="Reversible Plate", db_path="wn_parts.sqlite",
           dry_run=False):
    source_pdf = os.path.basename(pdf_path)
    data = extract(pdf_path, category=category)

    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Guard against duplicate insert.
    existing = cur.execute(
        "SELECT id, model_name FROM models WHERE source_pdf = ?",
        (source_pdf,),
    ).fetchone()
    if existing:
        print(f"REFUSE: model already exists for {source_pdf}: id={existing[0]} name={existing[1]!r}")
        con.close()
        return None

    cur.execute(
        "INSERT INTO models(model_name, category, doc_number, doc_issue, source_pdf, page_count) "
        "VALUES (?,?,?,?,?,?)",
        (data["model_name"], category, data["doc_number"], data["doc_issue"],
         source_pdf, data["page_count"]),
    )
    model_id = cur.lastrowid

    group_count = 0
    parts_count = 0
    recommended_count = 0

    seen_names = set()
    for g in data["groups"]:
        name = g["group_name"]
        # Apply existing (p.NNN) suffix convention on duplicates.
        if name in seen_names:
            name = f"{name} (p.{g['diagram_page']})"
        # If still duplicate (very rare), append seq too.
        if name in seen_names:
            name = f"{g['group_name']} (p.{g['diagram_page']} #{g['group_seq']})"
        seen_names.add(name)

        drawing = f"drawings/{slug}_p{g['diagram_page']:03d}.png"

        cur.execute(
            "INSERT INTO assembly_groups(model_id, group_name, group_seq, diagram_page, drawing_file) "
            "VALUES (?,?,?,?,?)",
            (model_id, name, g["group_seq"], g["diagram_page"], drawing),
        )
        group_id = cur.lastrowid
        group_count += 1

        for p in g["parts"]:
            cur.execute(
                "INSERT INTO parts(model_id, group_id, ref_pos, part_number, description, qty, "
                "measurement, torque, is_recommended) VALUES (?,?,?,?,?,?,?,?,?)",
                (model_id, group_id, p["ref_pos"], p["part_number"], p["description"],
                 p["qty"], p["measurement"], p["torque"], 1 if p["is_recommended"] else 0),
            )
            parts_count += 1
            if p["is_recommended"]:
                recommended_count += 1

    if dry_run:
        con.rollback()
        print(f"DRY-RUN: would insert model={data['model_name']!r} id={model_id} "
              f"groups={group_count} parts={parts_count} recommended={recommended_count}")
    else:
        con.commit()
        print(f"INSERTED model={data['model_name']!r} id={model_id} "
              f"groups={group_count} parts={parts_count} recommended={recommended_count}")
    con.close()
    return model_id


def rebuild_fts(db_path="wn_parts.sqlite"):
    con = sqlite3.connect(db_path)
    con.execute("INSERT INTO parts_fts(parts_fts) VALUES('rebuild')")
    con.commit()
    con.close()
    print("FTS rebuilt.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("slug")
    ap.add_argument("--category", default="Reversible Plate")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rebuild-fts", action="store_true")
    args = ap.parse_args()

    ingest(args.pdf, args.slug, category=args.category, dry_run=args.dry_run)
    if args.rebuild_fts and not args.dry_run:
        rebuild_fts()
