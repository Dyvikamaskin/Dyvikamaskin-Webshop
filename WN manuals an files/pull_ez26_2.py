"""Pull EZ26-2 mini excavator from both sources — focus on machine IDs / revisions / serial ranges."""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

print("=" * 76)
print("EZ26-2 mini excavator — identifying metadata in each source")
print("=" * 76)

# ─── eParts: find machines named EZ26-2 ─────────────────────────────────────
print("\n  ── eParts ────────────────────────────────────────────────────")
ez26_2_candidates = []
ez26_candidates = []
ep_dir = os.path.join(HERE, "eparts")
for fn in os.listdir(ep_dir):
    if not fn.endswith(".json"): continue
    try:
        d = json.load(open(os.path.join(ep_dir, fn), encoding="utf-8"))
    except Exception: continue
    name = d.get("machine_name", "") or ""
    if "ez26-2" in name.lower() or "ez26_2" in name.lower():
        ez26_2_candidates.append((d, fn))
    elif re.search(r"\bez26\b", name, re.I):
        ez26_candidates.append((d, fn))

print(f"  Machines whose name contains EZ26-2: {len(ez26_2_candidates)}")
for d, fn in ez26_2_candidates:
    print(f"\n    file:           {fn}")
    print(f"    machine_code:   {d.get('machine_code')!r}     (SAP material number)")
    print(f"    machine_name:   {d.get('machine_name')!r}")
    print(f"    category_path:  {d.get('category_path')}")
    revs = d.get("revisions", [])
    print(f"    revisions:      {[r.get('revision') for r in revs]}")
    for r in revs:
        print(f"      revision {r.get('revision')!r}:")
        print(f"        name:        {r.get('name')!r}")
        print(f"        has_bom_tree: {r.get('has_bom_tree')}")
        print(f"        components:   {len(r.get('components', []))}")
        print(f"        sub_revisions: {[sr.get('name') for sr in r.get('sub_revisions', [])]}")

print(f"\n  Plain EZ26 machines (for context):")
for d, fn in ez26_candidates[:5]:
    print(f"    {fn} — {d.get('machine_name')} — revisions={[r.get('revision') for r in d.get('revisions', [])]}")

# ─── LS Engineers: find ez26-2 diagrams ──────────────────────────────────────
print("\n  ── LS Engineers ──────────────────────────────────────────────")
ls_diagrams = []
with open(os.path.join(HERE, "lsengineers_diagrams.jsonl"), encoding="utf-8") as f:
    for line in f:
        r = json.loads(line)
        if re.search(r"-for-wacker-ez26-2\b", r["url"], re.I):
            ls_diagrams.append(r)
print(f"  EZ26-2 diagrams found: {len(ls_diagrams)}")
if ls_diagrams:
    sample = ls_diagrams[0]
    print(f"\n  Sample diagram page:")
    print(f"    url:          {sample['url']}")
    print(f"    title:        {sample['title']!r}")
    print(f"    breadcrumb:   {sample['breadcrumb']}")
    print(f"    hero_image:   {sample['hero_image']}")
    print(f"    description:  {(sample.get('description') or '')[:200]!r}")
    print(f"    n_parts:      {sample['n_parts']}")
    # Total SKUs across all diagrams
    all_skus = set()
    for d in ls_diagrams:
        for p in d.get("parts", []):
            if p.get("sku"): all_skus.add(p["sku"])
    print(f"\n  Across all {len(ls_diagrams)} EZ26-2 diagrams:")
    print(f"    distinct SKUs: {len(all_skus):,}")
    print(f"    titles (all):")
    for d in ls_diagrams:
        print(f"      - {d['title']}")

# Now also fetch the LS EZ26-2 model page to see if it mentions a serial range
print("\n  ── Fetching LS model page directly for serial-range hint ───")
# We can grep the raw HTML stored on disk — but we don't have the model-page HTML
# saved. Use a one-liner Chrome MCP equivalent: parse breadcrumb + check URL variants
# Look at the URL pattern: do any diagrams have a serial-range suffix?
import re
serial_patterns = []
for d in ls_diagrams:
    url = d["url"]
    # Look for any serial-like prefix in the URL
    m = re.findall(r"\b[A-Z]{2,4}[0-9A-Z]{4,15}\b", url.upper())
    if m: serial_patterns.append(m)
print(f"\n  Serial-pattern matches in LS URLs (none expected — LS uses model name + variant): {serial_patterns[:3]}")

# ─── Cross-reference: do they share SKUs? ────────────────────────────────────
print("\n  ── SKU cross-check ───────────────────────────────────────────")
if ez26_2_candidates and ls_diagrams:
    ep = ez26_2_candidates[0][0]
    def walk(node):
        out = set()
        if isinstance(node, dict):
            pn = node.get("partNumber")
            if pn and node.get("partName"):
                out.add(str(pn).strip())
            for v in node.values(): out |= walk(v)
        elif isinstance(node, list):
            for v in node: out |= walk(v)
        return out
    ep_skus = walk(ep)
    ls_skus = {p["sku"] for d in ls_diagrams for p in d.get("parts", []) if p.get("sku")}
    print(f"    eParts EZ26-2 distinct SKUs: {len(ep_skus):,}")
    print(f"    LS    EZ26-2 distinct SKUs: {len(ls_skus):,}")
    print(f"    Shared (in both):           {len(ep_skus & ls_skus):,}")
    print(f"    eParts only:                {len(ep_skus - ls_skus):,}")
    print(f"    LS only:                    {len(ls_skus - ep_skus):,}")
