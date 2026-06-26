"""
Export wn_parts.sqlite (the working WN parts DB) to a single JSON file that
prisma/draft/seed-wn-parts.ts can consume — keeps the seed pure Node, no
better-sqlite3 dependency.

Usage:
  python prisma/draft/export_wn_sqlite.py \\
      --db "../data/wn_parts.sqlite" \\
      --out prisma/draft/wn_parts_export.json

Output shape:
  {
    "exported_at": "<iso>",
    "source_db": "...",
    "counts": {"models": N, "groups": N, "parts": N},
    "models": [
      {
        "model_name": "...", "category": "...", "doc_number": "...",
        "doc_issue": "...", "source_pdf": "...", "page_count": N,
        "groups": [
          {
            "group_name": "...", "group_seq": N, "diagram_page": N,
            "drawing_file": "...",
            "parts": [
              {"ref_pos": "...", "part_number": "...", "description": "...",
               "qty": N, "measurement": "...", "torque": "...",
               "is_recommended": bool}
            ]
          }
        ]
      }
    ]
  }
"""
import os
import sys
import json
import sqlite3
import argparse
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")


def export(db_path, out_path):
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    models = [dict(r) for r in cur.execute(
        "SELECT id, model_name, category, doc_number, doc_issue, "
        "source_pdf, page_count FROM models ORDER BY id"
    )]
    groups = [dict(r) for r in cur.execute(
        "SELECT id, model_id, group_name, group_seq, diagram_page, drawing_file "
        "FROM assembly_groups ORDER BY model_id, group_seq, id"
    )]
    parts = [dict(r) for r in cur.execute(
        "SELECT id, model_id, group_id, ref_pos, part_number, description, "
        "qty, measurement, torque, is_recommended FROM parts ORDER BY group_id, id"
    )]
    con.close()

    # Nest groups under models, parts under groups, using the SQLite integer
    # IDs purely as join keys (they won't appear in the output).
    by_model = {m["id"]: {**m, "groups": []} for m in models}
    for m in by_model.values():
        m.pop("id")

    group_index = {}
    for g in groups:
        gid = g["id"]
        mid = g["model_id"]
        parent = by_model.get(mid)
        if parent is None:
            print(f"  ! orphan group {gid} (model_id={mid}) — skipped", file=sys.stderr)
            continue
        clean = {k: v for k, v in g.items() if k not in ("id", "model_id")}
        clean["parts"] = []
        parent["groups"].append(clean)
        group_index[gid] = clean

    orphan_parts = 0
    for p in parts:
        parent = group_index.get(p["group_id"])
        if parent is None:
            orphan_parts += 1
            continue
        clean = {k: v for k, v in p.items()
                 if k not in ("id", "model_id", "group_id")}
        clean["is_recommended"] = bool(clean.get("is_recommended"))
        parent["parts"].append(clean)
    if orphan_parts:
        print(f"  ! {orphan_parts} orphan parts (no parent group) — skipped",
              file=sys.stderr)

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_db": os.path.abspath(db_path),
        "counts": {
            "models": len(by_model),
            "groups": len(groups) - sum(1 for g in groups if g["model_id"] not in by_model),
            "parts": len(parts) - orphan_parts,
        },
        "models": list(by_model.values()),
    }

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"Wrote {out_path}  ({size_mb:.1f} MB)")
    print(f"  models: {payload['counts']['models']}")
    print(f"  groups: {payload['counts']['groups']}")
    print(f"  parts:  {payload['counts']['parts']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if not os.path.exists(args.db):
        sys.exit(f"DB not found: {args.db}")
    export(args.db, args.out)


if __name__ == "__main__":
    main()
