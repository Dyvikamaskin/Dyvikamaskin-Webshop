"""Summarize the LS Engineers assembly + part-detail walk outputs."""
import csv
import json
import re
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

print("=" * 64)
print("LS ENGINEERS — ASSEMBLY WALK")
print("=" * 64)
assemblies = [json.loads(l) for l in open("lsengineers_assemblies.jsonl", encoding="utf-8")]
print(f"\nAssembly pages: {len(assemblies):,}")
total_parts = sum(len(a.get("parts", [])) for a in assemblies)
unique_skus_in_assemblies = {p["sku"] for a in assemblies for p in a.get("parts", [])}
print(f"Total part-row instances: {total_parts:,}")
print(f"Unique SKUs across assemblies: {len(unique_skus_in_assemblies):,}")

pages_with_title = sum(1 for a in assemblies if a.get("title"))
pages_with_desc = sum(1 for a in assemblies if a.get("description"))
pages_with_hero = sum(1 for a in assemblies if a.get("hero_image"))
pages_with_gallery = sum(1 for a in assemblies if a.get("gallery_images") and len(a.get("gallery_images", [])))
pages_with_breadcrumb = sum(1 for a in assemblies if a.get("breadcrumb"))
pages_with_siblings = sum(1 for a in assemblies if a.get("sibling_links") and len(a.get("sibling_links", [])))
print(f"\nField coverage on assembly pages:")
print(f"  title:        {pages_with_title:>5,} / {len(assemblies):,}  ({100*pages_with_title/len(assemblies):.0f}%)")
print(f"  breadcrumb:   {pages_with_breadcrumb:>5,}  ({100*pages_with_breadcrumb/len(assemblies):.0f}%)")
print(f"  description:  {pages_with_desc:>5,}  ({100*pages_with_desc/len(assemblies):.0f}%)")
print(f"  hero_image:   {pages_with_hero:>5,}  ({100*pages_with_hero/len(assemblies):.0f}%)")
print(f"  gallery_imgs: {pages_with_gallery:>5,}  ({100*pages_with_gallery/len(assemblies):.0f}%)")
print(f"  sibling_links:{pages_with_siblings:>5,}  ({100*pages_with_siblings/len(assemblies):.0f}%)")

parts_with_price = sum(1 for a in assemblies for p in a.get("parts", []) if p.get("price_text"))
parts_with_image = sum(1 for a in assemblies for p in a.get("parts", []) if p.get("image_url"))
parts_with_stock = sum(1 for a in assemblies for p in a.get("parts", []) if p.get("stock_status") and p["stock_status"] != "unknown")
print(f"\nPart-row field coverage (across {total_parts:,} rows):")
print(f"  price_text:   {parts_with_price:>6,}  ({100*parts_with_price/total_parts:.0f}%)")
print(f"  image_url:    {parts_with_image:>6,}  ({100*parts_with_image/total_parts:.0f}%)")
print(f"  stock_status: {parts_with_stock:>6,}  ({100*parts_with_stock/total_parts:.0f}% known)")

cats = Counter()
for a in assemblies:
    bc = a.get("breadcrumb", [])
    if len(bc) >= 4:
        cats[bc[3]] += 1
print(f"\nAssembly pages by 4th breadcrumb level (machine type):")
for k, v in cats.most_common(15):
    print(f"  {v:>4,}  {k}")

print()
print("=" * 64)
print("LS ENGINEERS — PART-DETAIL WALK")
print("=" * 64)
parts = [json.loads(l) for l in open("lsengineers_parts.jsonl", encoding="utf-8")]
print(f"\nPart-detail records: {len(parts):,}")

def has_str(p, k): return bool(p.get(k) and str(p.get(k)).strip())
def has_list(p, k): return bool(p.get(k) and len(p.get(k, [])))
def has_dict(p, k): return bool(p.get(k) and len(p.get(k, {})))

n = len(parts)
print(f"\nField coverage:")
for k in ["title", "breadcrumb", "price_text", "price_amount", "stock_text", "description"]:
    fn = has_list if k == "breadcrumb" else has_str
    cnt = sum(fn(p, k) for p in parts)
    print(f"  {k:<18s} {cnt:>6,}  ({100*cnt/n:.0f}%)")
for k in ["image_urls", "fits_models", "replaces_oem"]:
    cnt = sum(has_list(p, k) for p in parts)
    print(f"  {k:<18s} {cnt:>6,}  ({100*cnt/n:.0f}%)")
attrs_cnt = sum(has_dict(p, "attributes") for p in parts)
print(f"  {'attributes':<18s} {attrs_cnt:>6,}  ({100*attrs_cnt/n:.0f}%)")

fits_counts = Counter(len(p.get("fits_models", [])) for p in parts)
print(f"\nDistribution of fits_models list length:")
for k in sorted(fits_counts)[:8]:
    print(f"  {k:>2} models:  {fits_counts[k]:>6,} parts")

replaces_counts = Counter(len(p.get("replaces_oem", [])) for p in parts)
print(f"\nDistribution of replaces_oem list length:")
for k in sorted(replaces_counts)[:6]:
    print(f"  {k} alt-OEMs:  {replaces_counts[k]:>6,} parts")

print(f"\n--- SAMPLE: part with rich data ---")
sample = next(
    (p for p in parts if has_list(p, "fits_models") and has_str(p, "description")
     and has_list(p, "image_urls") and has_str(p, "price_amount")),
    parts[0],
)
print(f"SKU:           {sample.get('sku')}")
print(f"Title:         {(sample.get('title', '') or '')[:90]}")
print(f"Price:         {sample.get('price_text')}  (amount={sample.get('price_amount')})")
print(f"Stock:         {sample.get('stock_text')}")
print(f"Fits models:   {sample.get('fits_models', [])[:5]}")
print(f"Replaces:      {sample.get('replaces_oem', [])[:5]}")
print(f"Images:        {len(sample.get('image_urls', []))}")
desc = (sample.get("description") or "")[:200]
print(f"Description:   {desc!r}")
attrs = (sample.get("attributes") or {})
attrs_short = dict(list(attrs.items())[:5])
print(f"Attributes:    {attrs_short}")

# Inventory cross-check
inv = set()
with open("inventory_matched.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for t in (r["wacker_skus_found"] or "").split(";"):
            t = t.strip()
            if t and re.fullmatch(r"1\d{9}", t):
                inv.add(t)
ls_by_sku = {p["sku"]: p for p in parts if p.get("sku")}
inv_in_ls = inv & set(ls_by_sku.keys())
inv_with_fits = sum(1 for s in inv_in_ls if has_list(ls_by_sku[s], "fits_models"))
inv_with_price = sum(1 for s in inv_in_ls if has_str(ls_by_sku[s], "price_amount"))
print(f"\n--- Inventory 1xxx coverage from LS Engineers ---")
print(f"Inventory 1xxx total:                    {len(inv):,}")
print(f"  In LS Engineers data:                  {len(inv_in_ls):,}  ({100*len(inv_in_ls)/len(inv):.1f}%)")
print(f"  With fits_models populated:            {inv_with_fits:,}")
print(f"  With GBP price:                        {inv_with_price:,}")
