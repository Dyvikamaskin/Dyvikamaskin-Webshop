# Handover — Wacker Neuson parts data

**Scope.** Self-contained work area at `industriparts/WN manuals an files/`. Not
yet merged into the industriparts project, but the Prisma schema for ingest is
now committed on branch `phase-oem-catalog @ 80a33e4` (parked SQL was thrown
away; replaced with a generic `Oem*` schema designed make-agnostic). No data
in Supabase yet — both projects were paused at session end.

> **For the upstream merge status + canonical TODO list, see
> [`../docs/handoff.md`](../docs/handoff.md)** — specifically the
> "23 June session" section and the "v4.3 OEM catalog follow-ups (open)"
> list under "Open follow-ups". The "Next steps" list below is the
> pre-merge view kept for traceability; the upstream list is canonical.
>
> **For the canonical data-sources knowledge base, see
> [`../docs/oem-data-sources.md`](../docs/oem-data-sources.md)** — SKU prefix
> taxonomy, per-source breakdown, inventory analysis, legacy↔modern map,
> decision matrix. Auto-regenerated reports live under this folder
> (`sku_overlap_report.md`, `inventory_overlap_report.md`,
> `sku_legacy_modern_map_report.md`).

---

## 2026-06-24 session — inventory analysis + Weidemann discovery + eParts gap

**Headline:** the user's `Inventory DM-WN.xlsx` (2,371 stocked SKUs) is **46%
Weidemann/Kramer** (`1xxxxxxxxx`) and **54% Wacker construction**
(`5xxxxxxxxx` + legacy `0xxxxxxx`). Our OEM catalog covers only **34.3%** of
stocked items today. Weidemann ingestion flipped from "deferred" to confirmed
in-scope as the next major milestone, and we discovered that **the eParts
portal exposes downloadable Parts Manual PDFs and has whole machine categories
(Lighting, Heating, Power Supply) our 572-machine scrape never touched.**

### What was built this session

1. **Cross-source SKU overlap analysis** (`analyze_sku_overlap.py`) — pairwise
   matrix across all 11 retailer CSVs + the OEM catalog. Output:
   `sku_overlap_report.md` / `.json` / `.csv`.
2. **Inventory overlap analysis** (`overlap_inventory_dmwn.py`) — reads
   `Inventory DM-WN.xlsx`, auto-detects the SKU column, scans every row for
   Wacker-shape SAP numbers. Output: `inventory_overlap_report.md` / `.json` +
   `inventory_matched.csv` / `inventory_unmatched.csv`.
3. **Weidemann eService recon + scraper** (`scrape_weidemann_catalog.py`) —
   built but parked; the sample from catalog 3 (13er_Serie, ids 1–500) confirmed
   60.6% overlap with Neyer.
4. **Legacy ↔ Modern SAP cross-reference build** (`build_sku_legacy_modern_map.py`)
   — mines (legacy `0xxxxxx`, modern `5xxxxxxxxx`) pairs from every available
   signal. **Built 49,365 distinct pairs** (DHS URL slugs contributed 33,384;
   hydrotech 15,954; the rest from inventory descriptions). Output:
   `sku_legacy_modern_map.csv` / `.json` + indexed for both-direction lookup.
   - Apply to inventory: `apply_mapping_to_inventory.py` — coverage moves from
     33.0% direct → 34.3% combined. Modest for inventory gap; big for catalog
     unification.
5. **DHS fitment recon + targeted scraper** (`scrape_dhs_fitment.py`) — DHS
   product pages carry a structured `<table class="fitment-table">` with
   `Name / Model / Machine Number` rows. Scraper targets the ~22K DHS SKUs
   that intersect our OEM catalog or inventory (not the full 144K). Running
   in background.
6. **eParts portal full enumerate + Parts Manual downloader**
   (`enumerate_and_download_eparts.py`) — 4 phases: walk
   `/navigation/categories/10` recursively → fetch revisions per machine →
   fetch documents endpoint per (machine, revision) → download every unique
   Parts Manual PDF. **Running in background.** Discovery prompted by user
   noting the link from the eParts machine page to `0610344-Rev101.pdf`
   (which is exactly the file format we already extracted manually).

### Key findings (added this session)

- **SKU prefix = brand identity.** `5xxxxxxxxx` = Wacker construction (mini
  excavators, plates, rammers, rollers, pumps, light towers); `1xxxxxxxxx` =
  Weidemann + Kramer (Hoftracs, telehandlers, agricultural wheel loaders);
  `0xxxxxxx` = pre-SAP legacy. Our existing 44,894 OEM rows are essentially
  all `5xxx` + legacy `0xxxxxx` — the Weidemann/Kramer side is unrepresented.
- **Neyer.de "weidemann-kramer-parts" really is Weidemann/Kramer.** 45,584
  SKUs scraped; 45,579 (99.99%) start with `1xxx`; only **5 overlap our
  WN OEM catalog**. Despite URLs being `/products/wackerneuson-NNNN`, the
  collection name is honest — it's the agricultural side of the WN Group.
- **DHS is multi-brand** (reclassified). 144,274 unique SKUs total; carries
  86,513 `1xxx` Weidemann/Kramer SKUs (1,894 of a 2,313 Weidemann eService
  sample = 82% coverage) on top of 22,817 of our 44,894 OEM construction SKUs.
  **DHS covers 84.6% of stocked inventory** — single best price source.
- **Inventory shape.** Of the 2,371 stocked SKUs: 1,276 Wacker construction,
  1,094 Weidemann/Kramer, 1 legacy. Direct OEM coverage = 783 (33%); via
  legacy↔modern mapping = +31 (34.3% combined); via retailer prices = 2,082
  (87.8%); zero data = 241 (10.2%).
- **80 "truly unknown" stocked SKUs.** Filtered to "stocked, in no retailer,
  no OEM, no Weidemann sample, no legacy mapping". Sample descriptions
  (`CONTROL BOX 530SE`, `ELECTRODE ASSEMBLY`, `P.E. CELL`, `CAPACITATOR`,
  `Repair Kit Exciter DPU100-70`) suggest light tower + heater equipment +
  service kits that don't appear in any of the 572 machine BOMs we walked.
  Investigation showed eParts has **Lighting**, **Heating**, **Power Supply**
  category branches we never enumerated — almost certainly where these live.
- **eParts has downloadable Parts Manuals.** The
  `/machine/details/{code}/revision/{rev}` API returns a `partsManuals[]`
  array with signed `medias/<file>.pdf?context=...` URLs (the same URL the
  user found in the browser for `0610344-Rev101.pdf`). All 572+ machines we
  enumerated probably have at least one downloadable manual we never
  fetched.

### Background jobs in flight at session end

| Task ID | Script | What | ETA |
|---|---|---|---|
| `b2258zv1d` | `scrape_dhs_fitment.py` | Walk ~22K DHS product pages, extract Compatibility & Fitment tables → `dhs_fitment.jsonl` | ~6h |
| `bxl6ia0ol` | `enumerate_and_download_eparts.py` | Phase 1 categories → Phase 2 revisions → Phase 3 documents → Phase 4 download Parts Manual PDFs. Resumable per phase. Outputs to `eparts_all_machines.json`, `eparts_machine_revisions.json`, `eparts_pdf_urls.json`, `eparts_pdfs/*.pdf` | ~3-5h |

Both are resumable. If a process dies, re-running the same command picks up
where it left off.

### Next steps (revised, in priority order)

> **The canonical TODO list lives in [`../docs/handoff.md`](../docs/handoff.md)**
> under "24 June session" → "Tomorrow's queue". Everything below is local
> context; the upstream list is authoritative.

1. **Re-enumerate eParts properly.** Our 572-machine walk missed huge swaths
   (EZ-series, Z3-series, many big-equipment codes). Walk
   `/navigation/nonRevMachine/{code}` per machine to capture WNC serial ranges.
2. **Deep-dig LS Engineers for hidden serial-range info** (tabled — was
   interrupted by cross-origin error).
3. **Build extended LS-only-machines seed** — 841 LS-only machines → full BOM
   hierarchy with `source=LSENGINEERS`; 143 LS machines overlapping eParts →
   enrich only.
4. **Top-up Neyer seed** when overnight scrape finishes.
5. **Process new Parts Manual PDFs** → second OemPart re-seed pass.
6. **Re-measure inventory coverage** (target 75-80%).
7. **Architecture target** — see `docs/oem-data-sources.md` §9 (3-environment
   DB + 13-layer production stack).
8. **Weidemann eService catalog walk** (still queued; `scrape_weidemann_catalog.py`
   exists). Some overlap with LS Engineers in `1xxx` SKUs but Weidemann has
   the dealer-side BOMs.
9. **Re-tmsequip past 10K** (unchanged from previous handover).

### Late-session additions (2026-06-24 evening)

The morning's "in-flight" jobs all completed. Major additions on top of the
section above:

- **eParts Phase 1-4 finished**: 572 machines (same as yesterday — full
  enumeration confirmed for the rev-based catalog branch), 2,180 Parts Manual
  PDFs downloaded (7.7 GB).
- **PDF bulk extraction**: 1,848 new extracts → `wn_parts.sqlite` grew to
  **2,202 models / 59K assembly groups / 826K parts / 35,627 distinct SKUs**
  (9.7× yesterday). The 22 RC-series PDFs that failed yesterday extracted
  cleanly this run.
- **DHS fitment scrape**: 21,511 / 24,921 (86%) DHS pages had structured
  fitment tables. Seeded 24,950 `OemPartCompatibility` rows.
- **Schema migration applied to prod**: `OemPart.legacyPartNumber` column +
  `OemPartCompatibility` table + `WEIDEMANN_ESERVICE` / `LSENGINEERS` enum
  values. Dev (`iuimkzettrrqvvvgfvqp`) NOT migrated — it's paused and on a
  different Supabase account.
- **LS Engineers discovered**: Cloudflare-protected Magento store, scrape
  via Chrome MCP. Sitemap covers 4% of diagrams; the other 96% only
  discoverable via link-graph crawling from model pages.
- **LS Engineers walk landed**: 10,351 diagrams / **191,540 parts** /
  **31,636 distinct SKUs** with 100% field coverage (`ref` callout #, `sku`,
  `name`, `price_amount`, `image_url`, `lead_time`). This is BOM-quality data
  for the 96-machine big-equipment gap eParts can't fill.
- **LS Engineers seeded**: 21,501 `OemPartListing` rows + 60,294
  `OemPartCompatibility` rows (after splitting comma-joined `fits_models`
  strings — increased 2.9×).
- **eParts catalog is BIGGER than our enumeration** captured. Live dashboard
  for EZ26-2 (machine `1000462823`) shows ~80+ excavator codes under "Tracked
  Zero Tail Excavators" alone. Our walk found 0 EZ-series. **Need to
  re-enumerate via the non-rev path.**
- **eParts DOES expose WNC serial ranges** for big-equipment via
  `/navigation/nonRevMachine/{code}` → `sparepartsBookList[].name` field
  (e.g., `"EZ26-2 (WNCE2401K00000140 - ...)"`). This is the natural revision
  identifier for big-equipment machines.
- **LS Engineers does NOT expose serial ranges** — variants are URL-slug
  suffixes only (`-1`, `-long`, `-left/right`). Cross-source matching:
  model name as join key, backfill WNC range from eParts.
- **Inventory coverage today: 33% → 66.8%** (Neyer 45K + LS Engineers 21.5K
  drove most of the lift).
- **Taxonomy correction**: `1xxxxxxxxx` is the WN Group post-SAP range for
  **big-equipment + agricultural** (verified on EZ80, TH627), not just
  Weidemann/Kramer. Old hypothesis corrected in `docs/oem-data-sources.md` §1.

### Files committed today

| Commit | Scope |
|---|---|
| `5f132fe` | `.gitignore` + `CLAUDE.md` collaboration rules |
| `9216b0d` | 30 Python tools (analysis + scrapers) |
| `780a5bb` | KB doc + this Handover (early-session content) + auto-reports |
| `5b7c536` | Schema migration + 3 new seed scripts + 11 late-session analysis scripts + canonical handoff update |

**SQLite** — `wn_parts.sqlite` (~20 MB), `wn_parts.sqlite.bak{,2,3,4,5,6}` rollback points.

- **365 models · 6,676 assembly groups · 85,021 parts · 2,590 recommended-spares flagged**
  *(was 17 / 660 / 8,041 at session start — 21× more models, 10× more parts)*
- `parts_fts` (FTS5 over part_number + description + notes) — rebuilt after each ingest
- Schema (unchanged):
  - `models(id, model_name, category, doc_number, doc_issue, source_pdf, page_count)`
  - `assembly_groups(id, model_id, group_name, group_seq, diagram_page, drawing_file)` — `UNIQUE(model_id, group_name)`
  - `parts(id, model_id, group_id, ref_pos, part_number, description, qty, measurement, torque, is_recommended)`

**Diagrams** — `drawings/` 737 PNGs at 150 DPI (176 MB). These are from the
original 17-model pass; the **348 newly-ingested models do NOT yet have
rendered diagrams** — only the SQLite metadata pointing at expected PNG paths.
Rendering 5,000+ more PNGs from the new PDFs is a separate task.

**Source PDFs**
- `*.pdf` in folder: 53 originals (17 ingested + 36 reference)
- `pdfs_shop/` — **375 factory PDFs** downloaded from `shop.wackerneuson.com`, **1.8 GB**. 372 fresh + 3 carried over from smoke. One 404 from the manifest (`SP__PG3A_100_Q4_5000009055.pdf` — likely unpublished).

**Per-PDF JSON extracts** — `extracts_shop/*.json` (351 files). One JSON per
successfully-extracted PDF, in the shape consumed by `bulk_ingest_shop.py`.

**Retailer scrape CSVs** (this folder):
- `wn_hydrotech.csv` — 25,000 rows (Shopify cap)
- `wn_danseusa.csv` — 17,493 rows (Shopify cap; vendor-filter walk)
- `wn_tmsequip_full.csv` — 10,000 rows (ConvertCart 10K cap; reported 66,678)
- `wn_russopower.csv` — 1,223 rows
- `wn_dhs.csv` — 600 rows (brand listing only)
- `wn_contractorsdirect.csv` — 170 rows (118 products × variants)
- `wn_tmsequip.csv` — 72 rows (legacy small listing, superseded by `_full`)
- `wn_dhs_klevu.csv` — **145,901 rows / 144,274 unique SKUs** via Klevu API (~99.8% of the reported 146,142)

**Reusable tooling** (this folder):
- `extract_wn_parts.py` — dual-layout extractor (auto-detects alfis vs SP via cover); subagent extended it to handle a "compact SP" layout (`is_compact_sp`, `parse_parts_page_sp_compact`) which fixed ~34 of the 58 originally-failing PDFs.
- `bulk_extract_shop.py` — loops `pdfs_shop/*.pdf` through `extract()`, writes JSON to `extracts_shop/`, resumable, layout-classification report.
- `bulk_ingest_shop.py` — loops `extracts_shop/*.json` into SQLite. Idempotent on `source_pdf`. FTS rebuild on commit.
- `download_wn_parts_pdfs.py` — reads `wn_catalogue.json`, downloads parts PDFs from shop.wackerneuson.com (`<medias-path>?context=<hybris-token>`), resumable via `.part` rename.
- `enumerate_wn_catalogue.py` — walks the shop.wackerneuson.com catalogue API → `wn_catalogue.json` (572 machines, 380 parts books mapped).
- `scrape_shopify_collection.py` — generic Shopify scraper (handles `--collection`, `--all-products`, `--strip-prefix`, `--vendor-filter`, 100-page-cap aware).
- `scrape_bigcommerce_brand.py` — generic BigCommerce brand listing (`--brand-filter`, parses `data-sku`/`data-name`).
- `scrape_tmsequip_search.py` — ConvertCart search-API scraper (20/page, 10K cap).
- `scrape_dhs_klevu.py` — Klevu search-API scraper (100/page, paginates past 10K, advances offset by `len(records)` not the requested limit — critical for Klevu which silently caps below request size).
- `scrape_hydrotech_wn.py`, `scrape_dhs_wn.py` — legacy per-site scripts (kept for reference; the generic scripts above supersede them).

**Parked artefacts in `industriparts/prisma/draft/`**
- `add_wn_parts_manuals.sql` — 74-line DB-free SQL preview (unchanged).
- `export_wn_sqlite.py` — NEW: exports `wn_parts.sqlite` to `wn_parts_export.json` (24.2 MB with current 85K parts).
- `seed-wn-parts.ts` — NEW: reads the JSON, upserts via Prisma. Idempotent on `(modelName, docNumber)`. Best-effort matches `machineModelId` against existing `MachineModel` rows by name (loose: case/spacing/dashes ignored).
- `wn_parts_export.json` — current 24.2 MB export, ready to seed.

**Prisma schema** in `prisma/schema.prisma`: `MachineModelManual`, `ManualAssemblyGroup`, `ManualPart` already exist (lines ~913-965). Migration still NOT applied.

---

## What was done this session

1. **Shop.wackerneuson.com probe + bulk download.** Subagent ran Chrome DevTools MCP against `https://shop.wackerneuson.com/eparts/`, identified anonymous JSON endpoints (`/ws/v2/amd/navigation/categories/{id}` + `/ws/v2/amd/machine/details/{code}/revision/{rev}`). Built `enumerate_wn_catalogue.py` → 572 machines, 350 with parts books, 380 manuals total. Built `download_wn_parts_pdfs.py` → 372 PDFs / 1.75 GB in 17 min.
2. **Bulk extraction + ingest pipeline.** Subagent wrote `bulk_extract_shop.py` + extended `extract_wn_parts.py` with a "compact SP" layout for shorter books. First pass: 313 OK / 58 failed (mostly RC110, CB250, ACBe, BOB, Anhänger, RD-series). Wrote `bulk_ingest_shop.py` and ingested the 313. Subagent later improved the classifier and 34 of the 58 re-extracted cleanly — those were ingested in a second pass. Final: 365 manuals in DB.
3. **Seven retailer scrapes built and run.** hydrotech, danseusa, russopower, dhs (brand-page + Klevu search-API), contractorsdirect, tmsequip (ConvertCart-API). **Total 200,387 rows / 161,243 unique SKUs.** Found and fixed two scrape gotchas: Shopify's 100-page cap (legacy `scrape_hydrotech_wn.py` lost 25K rows by raising instead of saving partial — patched), and Klevu's silent page-size capping (advancing offset by requested limit skips records — patched to use `len(records)`).
4. **Recon for additional retailers.** Subagent web-searched + spot-fetched candidates. 8 viable retailers identified: 2 US (equipmentshare.com, everestpartssupplies.com), 6 EU (neyer.de, htsspares.com, wackerdirect.com, tiendamamsa.com, isprzet.pl, gciron.com, harcoequipment.com — last 3 bot-blocked). None scraped yet — chip filed.
5. **Prisma seed prep.** Wrote `export_wn_sqlite.py` + `seed-wn-parts.ts`. Smoke-tested the export pipeline; the seed is ready but the migration hasn't been applied to `supabase-dev` yet.

---

## Key findings

- **Three Wacker Neuson part-number formats** dominate the universe: ~56% are 10-digit SAP starting with `5`, ~32% are 7-digit legacy starting with `0`, ~11% are 10-digit starting with `1`. ~98.4% of all 50K scraped SKUs fit one of these. The legacy `0xxxxxxx` space lives almost exclusively on hydrotech; SAP-era SKUs are split between danseusa, tmsequip, and (when it lands) dhs Klevu.
- **Retailer catalogs are largely disjoint.** Across 7 scrapes and 161,243 unique SKUs, most are single-source. The two big stores (hydrotech 24,983 and dhs-klevu 144,274) each contribute tens of thousands of exclusive SKUs. Combining sources is mostly additive, not redundant.
- **PDF ↔ retailer overlap is 52.4%.** Of 25,173 unique SKUs across the 365 parts books, **13,179** are carried by at least one scraped retailer. The DHS Klevu API alone roughly doubled overlap from 35.8% pre-Klevu. ~12K PDF SKUs still have NO retailer pricing — deeper-catalogue parts (small fasteners, retired items, dealer-only).
- **Public storefront search APIs are the goldmine for medium retailers.** Both DHS (Klevu) and tmsequip (ConvertCart) hide ~10-150× more products behind their search than their on-page brand listings expose. ConvertCart hard-caps anonymous offset traversal at 10K; Klevu doesn't (we paginated past 100K cleanly).
- **Two PDF layouts plus a third subfamily.** `alfis-format` (older books, bold = recommended spares). `SP-format` (newer SAP exports, no bold convention). The subagent's `is_compact_sp` adds a third detection that handles smaller, simpler SP books. **22 PDFs still fail** — mostly RC100/RC110 rollers (giant 44 MB books with 400+ pages) and 3 empty extracts.
- **shop.wackerneuson.com is fully scrapable anonymously.** Two JSON calls per machine code: catalog walk + per-machine detail. Each parts-manual entry returns a pre-signed `medias/...?context=<hybris-token>` URL — durable per fetch, no auth.
- **The newly-ingested 348 models have no diagram PNGs.** `drawings/` still has only the 737 PNGs from the original 17 models. Need to render ~5,000+ more pages from `pdfs_shop/*.pdf` to populate `assembly_groups.drawing_file` references.

---

## Next steps (in priority order)

> **Migrated to `docs/handoff.md` → "v4.3 OEM catalog follow-ups (open)".**
> The list below is kept for traceability of the work in this folder, but
> the upstream copy is canonical and references the actual branch + scripts.

1. ~~**Apply the parked Prisma migration to `supabase-dev` and seed.**~~
   Superseded. The parked SQL design (per-PDF `MachineModelManual` /
   `ManualAssemblyGroup` / `ManualPart`) was thrown away and replaced
   with the generic OEM-catalog schema in branch
   `phase-oem-catalog @ 80a33e4`. To apply: `npx prisma migrate deploy`
   from that branch against a live Supabase project, then run the
   three seeds (`prisma/seed-oem-eparts.ts`, `seed-oem-pdfs.ts`,
   `seed-part-prices.ts`). Full runbook in `docs/handoff.md`
   "23 June session → To finish the OEM-catalog ingest".
2. **Render diagrams for the 348 newly-ingested models.** `assembly_groups.drawing_file`
   already holds expected paths like `drawings/<slug>_p<NN>.png`. Adapt
   `render_diagrams.py` to walk the SQLite, fetch PDFs from `pdfs_shop/`, and render
   the missing pages at 150 DPI. Probably 5,000-8,000 new PNGs (~1-2 GB).
3. **Move `drawings/` to Supabase Storage.** ~10 GB once #2 lands. Update
   `ManualAssemblyGroup.drawingFile` to store the storage key instead of the
   local path.
4. **Re-run tmsequip beyond the 10K cap.** ConvertCart caps offset at 10000;
   `aggregations.categories[]` from the API gives per-category counts (~20-300
   each). Iterate per category and union — should reach the reported 66,678.
   Small modification to `scrape_tmsequip_search.py`.
5. **Two open follow-up chips:**
   - `task_53d35c2e` — recover the remaining 22 failed PDFs (RC100/RC110 rollers + the 3 empty extracts). Two paths: extend the SP classifier further, or PDF→OCR for the giants. Diagnosis already shows `classify_sp` is mostly fine for these — the bug is downstream in `extract_sp` looking for the diagram→parts pair pattern.
   - `task_9a05f5fe` — scrape the 8 backlog retailers. Top 3 (equipmentshare, neyer.de, htsspares) need no new code (just CLI args on the generic scripts) or a small HTML scraper. The 3 bot-blocked sites (gciron, harcoequipment, isprzet.pl) need Chrome MCP recon first.
6. **Hand-verify a sample.** Spot-check 10-20 part rows per category against
   the source PDFs and against retailer listings, especially for the SP-format
   models (`is_recommended` is always 0 — sane?) and the new compact-SP series.

---

## File map

```
WN manuals an files/
├── Handover-WN-data.md                ← this file
├── wn_parts.sqlite                    ← 365 models · 85,021 parts
├── wn_parts.sqlite.bak{,2,3,4,5,6}    ← rollback points
├── wn_catalogue.json                  ← shop.wackerneuson.com manifest (572 machines)
├── bulk_extract_report.json           ← per-PDF extraction status
├── bulk_ingest.log                    ← ingest run log
├── enumerate_wn_catalogue.py
├── download_wn_parts_pdfs.py
├── extract_wn_parts.py                ← dual-layout + compact-SP extractor
├── bulk_extract_shop.py               ← wraps extract_wn_parts.py over pdfs_shop/
├── bulk_ingest_shop.py                ← loops extracts_shop/*.json → SQLite
├── ingest_sp.py                       ← legacy per-PDF (kept for reference)
├── render_diagrams.py                 ← diagram renderer (needs extension)
├── scrape_shopify_collection.py       ← generic Shopify (Wacker + others)
├── scrape_bigcommerce_brand.py        ← generic BigCommerce
├── scrape_tmsequip_search.py          ← ConvertCart API
├── scrape_dhs_klevu.py                ← Klevu API
├── scrape_hydrotech_wn.py             ← legacy
├── scrape_dhs_wn.py                   ← legacy (brand-page only, superseded by Klevu)
├── wn_hydrotech.csv .. wn_dhs_klevu.csv  ← 7 retailer scrape CSVs
├── extracts_shop/                     ← 351 per-PDF JSON extracts
├── drawings/                          ← 737 PNGs (only for original 17 models)
├── pdfs_shop/                         ← 375 factory PDFs, 1.8 GB
├── Wacker_Neuson_*.xlsx               ← original Excel refs (superseded by PDFs)
├── WN_Parts_Books_Download_All*.html  ← original HTML manifests
└── *.pdf                              ← 53 source documents (17 ingested + 36 reference)
```

---

## Reproducibility runbook

To rebuild the SQLite from scratch (assuming PDFs are in place):

```bash
# 1. Discover machines + manuals
python enumerate_wn_catalogue.py --out wn_catalogue.json

# 2. Download parts PDFs (~17 min for 1.75 GB)
python download_wn_parts_pdfs.py --out-dir pdfs_shop

# 3. Extract parts data (~15 min, resumable)
python bulk_extract_shop.py

# 4. Ingest into SQLite (~1s, idempotent on source_pdf)
python bulk_ingest_shop.py

# 5. Export for Prisma seed
python ../prisma/draft/export_wn_sqlite.py \
  --db wn_parts.sqlite \
  --out ../prisma/draft/wn_parts_export.json
```

To rebuild all 6 retailer scrapes (~30 min total):

```bash
python scrape_hydrotech_wn.py --out wn_hydrotech.csv --delay 0.4
python scrape_shopify_collection.py --host https://www.danseusa.com --all-products --vendor-filter "Wacker Neuson" --out wn_danseusa.csv
python scrape_shopify_collection.py --host https://russopower.com --collection wacker-neuson --strip-prefix "Wacker Neuson" --out wn_russopower.csv
python scrape_shopify_collection.py --host https://www.contractorsdirect.com --collection wacker-neuson --out wn_contractorsdirect.csv
python scrape_tmsequip_search.py --out wn_tmsequip_full.csv --delay 0.4
python scrape_dhs_klevu.py --out wn_dhs_klevu.csv --limit-per-page 100 --delay 0.4
```
