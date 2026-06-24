"""Side-by-side: how eParts describes a machine vs how LS Engineers does.
Picks two examples — a shared machine (DPU 100-70) and an LS-only telehandler (TH627)."""
import json
import os
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# eParts shape — read the DPU 100-70Les JSON (machine 5000610344)
# ============================================================
print("=" * 70)
print("ePARTS SHAPE  (source: shop.wackerneuson.com /ws/v2/amd/* )")
print("=" * 70)
d = json.load(open(os.path.join(HERE, "eparts", "5000610344.json"), encoding="utf-8"))

print(f"\nTop-level fields:")
for k, v in d.items():
    if k == "revisions":
        print(f"  {k:<18s}: [list of {len(v)} revisions]")
    elif k == "category_path":
        print(f"  {k:<18s}: {v}")
    elif isinstance(v, (str, int, float, type(None))):
        print(f"  {k:<18s}: {v!r}")

print(f"\nRevisions array shape (one entry shown):")
rev = d["revisions"][0]
for k, v in rev.items():
    if k == "components":
        print(f"  {k:<18s}: [list of {len(v)} top-level components]")
    elif k == "sub_revisions":
        print(f"  {k:<18s}: [list of {len(v)} sub-revisions]")
    else:
        print(f"  {k:<18s}: {v!r}")

print(f"\nSub-revisions sample (machine decomposes into engine, exciter, etc.):")
for sr in rev.get("sub_revisions", [])[:5]:
    print(f"  - {sr['name']!r:<35s} position={sr.get('position')} "
          f"sub_machine_code={sr.get('sub_machine_code')} devices={len(sr.get('devices', []))}")

# A device inside a sub-revision has a component → parts[]
sr0 = rev["sub_revisions"][0]
dev0 = sr0["devices"][0]
print(f"\nDevice shape (1 device inside sub_revision[0]):")
for k, v in dev0.items():
    if k == "component":
        print(f"  {k:<18s}: object with {len(v.get('parts', []))} parts + diagram refs")
    else:
        print(f"  {k:<18s}: {v!r}")
print(f"  component keys: {list(dev0.get('component', {}).keys())}")
print(f"  parts[0]:       {dev0.get('component', {}).get('parts', [{}])[0]}")

# Count parts via this machine
total_parts = 0
for r_ in d.get("revisions", []):
    for sr in r_.get("sub_revisions", []):
        for dev in sr.get("devices", []):
            total_parts += len(dev.get("component", {}).get("parts", []))
print(f"\nTotal parts across all revisions+subs: {total_parts:,}")

# ============================================================
# LS Engineers shape — the TH627 telehandler (LS-only)
# ============================================================
print()
print("=" * 70)
print("LS ENGINEERS SHAPE  (source: lsengineers.co.uk)")
print("=" * 70)

# Pull TH627-22 (the variant we know about) diagrams
diagrams_for_th627_22 = []
with open(os.path.join(HERE, "lsengineers_diagrams.jsonl"), encoding="utf-8") as f:
    for line in f:
        r = json.loads(line)
        u = r["url"]
        if re.search(r"wn-th627-22-\d+-group\.html$|(?:differential|wiper|rear-window)[\w-]*-for-wacker-th627-telehandler", u):
            diagrams_for_th627_22.append(r)

print(f"\nMachine identification in LS:")
print(f"  Identifier:    'th627' (model code, derived from URL slug)")
print(f"  Variant token: '22' (from wn-th627-22-N-group.html — implies the 418-22 build)")
print(f"  No SAP material number directly exposed by LS")
print(f"  Breadcrumb on a diagram page tells us the variant chain:")

sample = diagrams_for_th627_22[0]
print(f"\nSample diagram page ({sample['url']}):")
print(f"  title:        {sample['title']!r}")
print(f"  breadcrumb:   {sample['breadcrumb']}")
print(f"  hero_image:   {sample['hero_image']}")
print(f"  description:  {(sample.get('description') or '')[:120]!r}")
print(f"  n_parts:      {sample['n_parts']}")
print(f"  parts[0]:")
for k, v in sample["parts"][0].items():
    print(f"    {k:<14s}: {v!r}")

# How does LS distinguish variants? Look at how many unique variants of TH627 we have
th627_variants = defaultdict(int)
with open(os.path.join(HERE, "lsengineers_diagrams.jsonl"), encoding="utf-8") as f:
    for line in f:
        r = json.loads(line)
        u = r["url"]
        m = re.search(r"wn-th627-(\d+)-\d+-group\.html$", u)
        if m:
            th627_variants[m.group(1)] += 1

print(f"\nTH627 variant tokens in LS data (from URL '-wn-th627-XX-N-group.html'):")
for v, c in sorted(th627_variants.items()):
    print(f"  variant '{v}' (= 418-{v} build): {c} diagrams")
print(f"  → eParts equivalent: would be machine_code 'XXXX-418-{v}' and a revision number")

print("\n" + "=" * 70)
print("MAPPING NOTES — to build the LSENGINEERS BOM hierarchy")
print("=" * 70)
print("""
eParts → OemMachine.code = 10-digit SAP number
LS     → no SAP number; use derived "lsengineers:<model>-<variant>" code
         e.g., "lsengineers:th627-22" for TH627 (418-22) variant

eParts → OemMachine.name = "DPU 100-70Les_5000610344"
LS     → derive from breadcrumb segment 'Wacker TH627 (418-22) Telehandler Parts'

eParts → OemMachineRevision.revision = "101" (numeric)
LS     → derive from URL pattern '-wn-<model>-<variant>-N-group' (e.g., '22' → '418-22')

eParts → OemComponent.name = "Vibration Plate" (per sub_revision device)
LS     → diagram title minus boilerplate, e.g., 'Control Valve Assembly'

eParts → OemComponent.diagramImageFilename = pre-rendered HD PNG with hotspot coords
LS     → hero_image URL (catalog placeholder OR real diagram), no hotspot data

eParts → OemPart.calloutNumber = matches hotspotsJson
LS     → use part 'ref' field (the diagram callout number — LS exposes this)
""")
