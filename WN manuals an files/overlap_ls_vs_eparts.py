"""Compute overlap between LS Engineers BOMs (10,351 diagrams from
lsengineers_diagrams.jsonl) and eParts BOMs (572 machine JSONs in eparts/).

For each machine in eParts, find the LS diagrams that share the most parts
(implies the same machine). Then bucket machines by overlap source.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# ─── Load LS diagrams ──────────────────────────────────────────────────────
print("Loading LS Engineers diagrams ...")
ls_machine_skus = defaultdict(set)  # ls_machine_id -> set of SKUs
ls_diagram_count = defaultdict(int)
ls_url_to_machine = {}
total_ls_parts = 0
total_ls_diagrams = 0
all_ls_skus = set()

# Extract machine identifier from URL: "<assembly>-for-wacker-<machine>.html"
ID_RE = re.compile(r"-for-wacker-([a-z0-9-]+?)(?:-mini-excavator|-telehandler|-dumper|-roller|-rammer|-compactor|-loader|-breaker|-pump|-engine|-light|-tower|-cutter|-saw|-vibrator|-poker|-trowel|-rebar|\.html)", re.I)

with open(os.path.join(HERE, "lsengineers_diagrams.jsonl"), encoding="utf-8") as f:
    for line in f:
        if not line.strip(): continue
        d = json.loads(line)
        url = d["url"]
        m = ID_RE.search(url)
        machine_id = m.group(1) if m else "_unknown"
        total_ls_diagrams += 1
        ls_diagram_count[machine_id] += 1
        for p in d.get("parts", []):
            sku = (p.get("sku") or "").strip()
            if sku:
                ls_machine_skus[machine_id].add(sku)
                all_ls_skus.add(sku)
                total_ls_parts += 1

print(f"  LS diagrams:        {total_ls_diagrams:,}")
print(f"  LS distinct machine-ids: {len(ls_machine_skus):,}")
print(f"  LS total part-records:   {total_ls_parts:,}")
print(f"  LS distinct SKUs:        {len(all_ls_skus):,}")

# ─── Load eParts BOMs ──────────────────────────────────────────────────────
print("\nLoading eParts BOMs ...")
eparts_machine_skus = defaultdict(set)
eparts_machine_name = {}
all_eparts_skus = set()
for fname in os.listdir(os.path.join(HERE, "eparts")):
    if not fname.endswith(".json"): continue
    code = fname.replace(".json", "")
    try:
        d = json.load(open(os.path.join(HERE, "eparts", fname), encoding="utf-8"))
    except Exception:
        continue
    eparts_machine_name[code] = d.get("machine_name", "")
    def walk(node):
        if isinstance(node, dict):
            pn = node.get("partNumber")
            if pn:
                pn = str(pn).strip()
                if pn:
                    eparts_machine_skus[code].add(pn)
                    all_eparts_skus.add(pn)
            for v in node.values(): walk(v)
        elif isinstance(node, list):
            for v in node: walk(v)
    walk(d)

eparts_with_parts = {c: s for c, s in eparts_machine_skus.items() if s}
print(f"  eParts machines (any BOM data): {len(eparts_with_parts):,} / 572")
print(f"  eParts distinct SKUs:           {len(all_eparts_skus):,}")

# ─── SKU-level overlap ─────────────────────────────────────────────────────
print("\n=== SKU-level overlap ===")
shared = all_ls_skus & all_eparts_skus
ls_only = all_ls_skus - all_eparts_skus
eparts_only = all_eparts_skus - all_ls_skus
print(f"  Shared (in both LS and eParts):     {len(shared):,}")
print(f"  LS only (not in eParts):            {len(ls_only):,}")
print(f"  eParts only (not in LS):            {len(eparts_only):,}")

# Prefix split of LS-only
def prefix(s):
    if re.fullmatch(r"\d{7}", s): return "0xxxxxxx legacy"
    if re.fullmatch(r"\d{10}", s): return f"10d_{s[0]}xxx"
    return "other"
ls_only_pref = Counter(prefix(s) for s in ls_only)
print(f"  LS-only SKUs by prefix: {dict(ls_only_pref.most_common())}")

# ─── Machine-level overlap (Jaccard) ───────────────────────────────────────
# For each eParts machine, find the LS machine-id with highest part overlap.
print("\n=== Machine-level overlap (top match per eParts machine) ===")
matches = []  # [(eparts_code, eparts_name, ls_id, overlap, ls_total, eparts_total, jaccard)]
for ep_code, ep_skus in eparts_with_parts.items():
    if not ep_skus: continue
    best_id, best_overlap, best_jaccard = None, 0, 0.0
    for ls_id, ls_skus in ls_machine_skus.items():
        ov = len(ep_skus & ls_skus)
        if ov == 0: continue
        union = len(ep_skus | ls_skus)
        jaccard = ov / union
        if ov > best_overlap or (ov == best_overlap and jaccard > best_jaccard):
            best_id, best_overlap, best_jaccard = ls_id, ov, jaccard
    matches.append({
        "eparts_code": ep_code,
        "eparts_name": eparts_machine_name.get(ep_code, "")[:50],
        "eparts_parts": len(ep_skus),
        "best_ls_id": best_id,
        "ls_parts": len(ls_machine_skus[best_id]) if best_id else 0,
        "overlap": best_overlap,
        "jaccard": best_jaccard,
    })

# Bucket by match quality
strong = [m for m in matches if m["jaccard"] > 0.3]
weak = [m for m in matches if 0 < m["jaccard"] <= 0.3]
no_match = [m for m in matches if m["jaccard"] == 0]
print(f"  Strong matches (Jaccard > 0.3):     {len(strong):,}  ← same machine in both")
print(f"  Weak matches (Jaccard 0-0.3):       {len(weak):,}    ← partial / shared subassemblies")
print(f"  No SKU overlap:                     {len(no_match):,}    ← eParts-only machines")

print(f"\nTop 15 strongest matches:")
strong.sort(key=lambda m: -m["jaccard"])
for m in strong[:15]:
    print(f"  [{m['jaccard']:.2f}] eParts {m['eparts_code']:<12s} ({m['eparts_name'][:30]:<30s}) "
          f"ep={m['eparts_parts']:>4d}  ls={m['ls_parts']:>4d}  shared={m['overlap']:>4d}  "
          f"→ ls:{m['best_ls_id']}")

print(f"\nWeak-match samples (Jaccard 0.05-0.3):")
weak.sort(key=lambda m: -m["overlap"])
for m in weak[:10]:
    print(f"  [{m['jaccard']:.2f}] eParts {m['eparts_code']:<12s} ({m['eparts_name'][:30]:<30s}) "
          f"ep={m['eparts_parts']:>4d}  ls={m['ls_parts']:>4d}  shared={m['overlap']:>4d}  "
          f"→ ls:{m['best_ls_id']}")

# LS-only machine-ids (not matched to any eParts machine)
matched_ls_ids = {m["best_ls_id"] for m in strong + weak if m["best_ls_id"]}
ls_only_ids = set(ls_machine_skus.keys()) - matched_ls_ids
print(f"\n=== LS machine-ids NOT corresponding to any eParts machine ===")
print(f"  Count: {len(ls_only_ids):,}")
top_ls_only = sorted(ls_only_ids, key=lambda i: -len(ls_machine_skus[i]))[:20]
print(f"  Top 20 by SKU count:")
for i in top_ls_only:
    print(f"    {i:<28s}  {len(ls_machine_skus[i]):>4} SKUs  {ls_diagram_count[i]:>3} diagrams")
