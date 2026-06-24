"""
Bulk-ingest the per-PDF JSON extracts in `extracts_shop/` into wn_parts.sqlite.

Mirrors ingest_sp.py's INSERT logic but loops over already-extracted JSON
snapshots so we don't re-run pdfplumber on each PDF. Skips any whose
source_pdf is already in the `models` table.

Usage:
  python bulk_ingest_shop.py [--extracts-dir extracts_shop] [--db wn_parts.sqlite]
                             [--limit N] [--dry-run] [--no-rebuild-fts]

Final summary lists per-status counts and any rejected JSONs with reason.
"""
import os
import sys
import glob
import json
import time
import sqlite3
import argparse

sys.stdout.reconfigure(encoding="utf-8")


def ingest_one(cur, extract):
    source_pdf = extract["source_pdf"]
    existing = cur.execute(
        "SELECT id, model_name FROM models WHERE source_pdf = ?",
        (source_pdf,),
    ).fetchone()
    if existing:
        return ("skipped", source_pdf, f"already in DB (id={existing[0]})", 0, 0, 0)

    cur.execute(
        "INSERT INTO models(model_name, category, doc_number, doc_issue, source_pdf, page_count) "
        "VALUES (?,?,?,?,?,?)",
        (
            extract["model_name"],
            extract.get("category"),
            extract.get("doc_number"),
            extract.get("doc_issue"),
            source_pdf,
            extract.get("page_count"),
        ),
    )
    model_id = cur.lastrowid

    slug = extract.get("filename_model_slug") or extract["model_name"]
    slug = slug.replace("/", "_").replace(" ", "_")

    group_count = 0
    part_count = 0
    rec_count = 0
    seen_group_names = set()

    for g in extract.get("groups") or []:
        name = g.get("group_name") or "(unnamed group)"
        diagram_page = g.get("diagram_page")
        # ingest_sp.py-style disambiguation on duplicate group names.
        if name in seen_group_names:
            name = f"{name} (p.{diagram_page})"
        if name in seen_group_names:
            name = f"{g['group_name']} (p.{diagram_page} #{g.get('group_seq')})"
        seen_group_names.add(name)

        drawing = f"drawings/{slug}_p{diagram_page:03d}.png" if diagram_page else None

        cur.execute(
            "INSERT INTO assembly_groups(model_id, group_name, group_seq, diagram_page, drawing_file) "
            "VALUES (?,?,?,?,?)",
            (model_id, name, g.get("group_seq"), diagram_page, drawing),
        )
        group_id = cur.lastrowid
        group_count += 1

        for p in g.get("parts") or []:
            is_rec = 1 if p.get("is_recommended") else 0
            cur.execute(
                "INSERT INTO parts(model_id, group_id, ref_pos, part_number, description, qty, "
                "measurement, torque, is_recommended) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    model_id, group_id,
                    p.get("ref_pos"),
                    p.get("part_number") or "",
                    p.get("description") or "",
                    p.get("qty"),
                    p.get("measurement"),
                    p.get("torque"),
                    is_rec,
                ),
            )
            part_count += 1
            rec_count += is_rec

    return ("inserted", source_pdf, None, group_count, part_count, rec_count)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extracts-dir", default="extracts_shop")
    ap.add_argument("--db", default="wn_parts.sqlite")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-rebuild-fts", action="store_true")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.extracts_dir, "*.json")))
    if args.limit:
        files = files[: args.limit]
    print(f"Found {len(files)} extract JSONs in {args.extracts_dir}/")
    if not files:
        return

    con = sqlite3.connect(args.db)
    cur = con.cursor()

    counts = {"inserted": 0, "skipped": 0, "failed": 0}
    totals = {"groups": 0, "parts": 0, "recommended": 0}
    rejects = []  # (source_pdf, reason)
    started = time.time()

    for i, path in enumerate(files, 1):
        try:
            with open(path, encoding="utf-8") as f:
                extract = json.load(f)
        except Exception as e:
            counts["failed"] += 1
            rejects.append((os.path.basename(path), f"JSON parse error: {e}"))
            continue

        if not extract.get("groups"):
            counts["failed"] += 1
            rejects.append((extract.get("source_pdf") or path, "no groups in extract"))
            continue

        try:
            status, src, reason, g, p, r = ingest_one(cur, extract)
        except Exception as e:
            counts["failed"] += 1
            rejects.append((extract.get("source_pdf") or path, f"ingest error: {e}"))
            continue

        counts[status] += 1
        totals["groups"] += g
        totals["parts"] += p
        totals["recommended"] += r

        if i % 25 == 0 or i == len(files):
            print(f"  [{i}/{len(files)}] {status:8s}  {src}  groups={g} parts={p}",
                  flush=True)
        if reason and status == "skipped":
            rejects.append((src, reason))

    if args.dry_run:
        con.rollback()
        print("\nDRY-RUN: rolled back. No changes committed.")
    else:
        con.commit()
        if not args.no_rebuild_fts and counts["inserted"] > 0:
            print("\nRebuilding FTS index ...")
            con.execute("INSERT INTO parts_fts(parts_fts) VALUES('rebuild')")
            con.commit()
            print("  done.")
    con.close()

    elapsed = time.time() - started
    print()
    print("=" * 60)
    print(f"Inserted: {counts['inserted']}")
    print(f"Skipped:  {counts['skipped']}  (already in DB)")
    print(f"Failed:   {counts['failed']}")
    print(f"Groups:   {totals['groups']}")
    print(f"Parts:    {totals['parts']}")
    print(f"Recommended-flagged: {totals['recommended']}")
    print(f"Elapsed:  {elapsed:.1f}s")
    if rejects:
        print(f"\n{len(rejects)} rejects (first 10):")
        for src, reason in rejects[:10]:
            print(f"  {src}: {reason}")


if __name__ == "__main__":
    main()
