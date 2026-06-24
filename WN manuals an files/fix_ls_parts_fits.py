"""Post-process lsengineers_parts.jsonl: split comma-joined fits_models[0]
into separate model entries. In-place rewrite (backed up first)."""
import json
import os
import shutil
import sys

sys.stdout.reconfigure(encoding="utf-8")

SRC = "lsengineers_parts.jsonl"
BAK = "lsengineers_parts.unsplit.jsonl.bak"

if not os.path.exists(BAK):
    shutil.copy(SRC, BAK)
    print(f"Backed up {SRC} -> {BAK}")

lines = open(SRC, encoding="utf-8").read().splitlines()
new_lines = []
n_changed = 0
total_before = 0
total_after = 0

for line in lines:
    if not line.strip():
        continue
    p = json.loads(line)
    fm = p.get("fits_models") or []
    total_before += len(fm)
    if len(fm) == 1 and "," in fm[0]:
        # Split on comma + strip
        parts = [s.strip() for s in fm[0].split(",")]
        parts = [s for s in parts if s and len(s) > 1 and len(s) < 60]
        # Dedup, keep order
        seen = set()
        clean = []
        for s in parts:
            if s not in seen:
                seen.add(s)
                clean.append(s)
        p["fits_models"] = clean
        n_changed += 1
    total_after += len(p.get("fits_models", []))
    new_lines.append(json.dumps(p, ensure_ascii=False))

with open(SRC, "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))

print(f"Rows total:        {len(new_lines):,}")
print(f"Rows changed:      {n_changed:,}")
print(f"fits_models before: {total_before:,}")
print(f"fits_models after:  {total_after:,}  (+{total_after-total_before:,})")
print(f"Wrote {SRC}")
