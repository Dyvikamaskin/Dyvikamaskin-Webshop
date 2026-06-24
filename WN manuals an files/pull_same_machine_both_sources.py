"""Pull data for the SAME machine from both eParts and LS Engineers, side-by-side."""
import json
import os
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))


def load_eparts(code):
    path = os.path.join(HERE, "eparts", f"{code}.json")
    if not os.path.exists(path): return None
    return json.load(open(path, encoding="utf-8"))


def get_eparts_parts(d):
    """Walk all parts in the eParts JSON. Recursive — handles both shapes:
       (a) revisions[].sub_revisions[].devices[].component.parts[]   (DPU 100-70 style)
       (b) revisions[].components[].component.parts[]                (CT24-230E style)
       plus any other nesting (some machines have either or both)."""
    out = []
    # Track context as we descend
    def walk(node, ctx):
        if isinstance(node, dict):
            # If this looks like a part-row, record it with context
            if "partNumber" in node and "partName" in node:
                out.append({
                    "revision":         ctx.get("revision"),
                    "sub_revision":     ctx.get("sub_revision"),
                    "device":           ctx.get("device"),
                    "component_name":   ctx.get("component_name"),
                    "component_code":   ctx.get("component_code"),
                    "diagram_filename": ctx.get("diagram_filename"),
                    "calloutNumber":    node.get("diagramCalloutNumber"),
                    "qty":              node.get("diagramQuantity"),
                    "sku":              node.get("partNumber"),
                    "name":             node.get("partName"),
                    "unit":             node.get("unitOfMeasure"),
                })
                return  # don't descend further into a part row
            # Track context fields when we recognise them
            new_ctx = dict(ctx)
            if "revision" in node and isinstance(node["revision"], str) and "components" in node:
                new_ctx["revision"] = node["revision"]
            if "name" in node and isinstance(node.get("name"), str):
                if "sub_revisions" in node:
                    pass  # this is a revision-level name, skip
                elif "devices" in node:
                    new_ctx["sub_revision"] = node["name"]
                else:
                    new_ctx["device"] = node["name"]
            if "code" in node and isinstance(node.get("code"), str):
                new_ctx["component_code"] = node["code"]
                if "parts" in node and isinstance(node.get("name", None), str):
                    new_ctx["component_name"] = node.get("name")
            if "diagramImage" in node and isinstance(node["diagramImage"], dict):
                fn = node["diagramImage"].get("filename")
                if fn: new_ctx["diagram_filename"] = fn
            for v in node.values():
                walk(v, new_ctx)
        elif isinstance(node, list):
            for v in node:
                walk(v, ctx)

    walk(d, {})
    return out


def get_ls_for_machine(machine_token):
    """Pull all LS diagrams whose URL contains `-for-wacker-<machine_token>-...`."""
    out = []
    pat = re.compile(rf"-for-wacker-{re.escape(machine_token)}\b", re.I)
    with open(os.path.join(HERE, "lsengineers_diagrams.jsonl"), encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if pat.search(r["url"]):
                out.append(r)
    return out


def print_compare(label, eparts_code, ls_token):
    print("\n" + "=" * 76)
    print(f"  {label}    (eParts: {eparts_code}    /    LS: {ls_token})")
    print("=" * 76)

    ep = load_eparts(eparts_code)
    if not ep:
        print("  [eParts JSON not found]")
        return
    ep_parts = get_eparts_parts(ep)
    ls_diags = get_ls_for_machine(ls_token)
    ls_parts = []
    for d in ls_diags:
        for p in d.get("parts", []):
            ls_parts.append({"diagram": d["url"].split("/")[-1].replace(".html", ""), **p})

    print(f"\n  ── eParts ────────────────────────────────────────────────────")
    print(f"    machine_name:    {ep.get('machine_name')!r}")
    print(f"    category_path:   {ep.get('category_path')}")
    print(f"    revisions:       {[r.get('revision') for r in ep.get('revisions', [])]}")
    sub_rev_names = {sr.get('name') for r in ep.get('revisions', []) for sr in r.get('sub_revisions', [])}
    print(f"    sub_revisions:   {sorted(sub_rev_names) if sub_rev_names else '(none)'}")
    comp_count = sum(len(r.get('components', [])) for r in ep.get('revisions', []))
    print(f"    top-level components total (across revisions): {comp_count}")
    print(f"    parts total (recursive): {len(ep_parts):,}  /  distinct SKUs: {len({p['sku'] for p in ep_parts}):,}")

    print(f"\n  ── LS Engineers ──────────────────────────────────────────────")
    print(f"    diagrams found:  {len(ls_diags):,}")
    if ls_diags:
        sample_breadcrumb = ls_diags[0].get("breadcrumb", [])
        print(f"    breadcrumb:      {sample_breadcrumb}")
        diag_titles = [d.get("title", "") for d in ls_diags]
        print(f"    diagrams (first 8 titles):")
        for t in diag_titles[:8]:
            print(f"      - {t}")
        if len(diag_titles) > 8:
            print(f"      ... ({len(diag_titles)-8} more)")
    print(f"    parts total:     {len(ls_parts):,}  /  distinct SKUs: {len({p['sku'] for p in ls_parts}):,}")

    # Cross-check: shared SKUs
    ep_skus = {p['sku'] for p in ep_parts}
    ls_skus = {p['sku'] for p in ls_parts}
    shared = ep_skus & ls_skus
    print(f"\n  ── SKU comparison ────────────────────────────────────────────")
    print(f"    in eParts only:  {len(ep_skus - ls_skus):>4}")
    print(f"    in BOTH:         {len(shared):>4}")
    print(f"    in LS only:      {len(ls_skus - ep_skus):>4}")

    if shared:
        # Sample side-by-side for one shared SKU
        sample_sku = sorted(shared)[0]
        ep_rec = next(p for p in ep_parts if p['sku'] == sample_sku)
        ls_rec = next(p for p in ls_parts if p['sku'] == sample_sku)
        print(f"\n  ── Sample shared SKU: {sample_sku} ─────────────────────────────")
        print(f"    eParts says:")
        for k, v in ep_rec.items():
            print(f"      {k:<20s} {v!r}")
        print(f"    LS Engineers says:")
        for k, v in ls_rec.items():
            print(f"      {k:<20s} {v!r}")


# Example 1: strong match (Jaccard ~0.94)
print_compare("CT24-230E (concrete trowel)", "5000620377", "ct24-230e")

# Example 2: weak match (Jaccard 0.15) — same machine but different decomposition depth
print_compare("DPU 100-70Les (reversible vibratory plate)", "5000610344", "dpu100-70-plate")
