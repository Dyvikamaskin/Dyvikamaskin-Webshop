# OEM data sources — knowledge base

What's in our catalog, where it came from, and how the SKU numbering ranges
overlap (or don't) across sources. Use this to decide which retailer to scrape
for what, and whether a data source is worth ingesting.

> **Companion files** (all auto-generated; regenerate to refresh):
> - `WN manuals an files/sku_overlap_report.md` — pairwise overlap matrix across all retailer CSVs + the OEM catalog DB. Regenerate: `python "WN manuals an files/analyze_sku_overlap.py"`.
> - `WN manuals an files/inventory_overlap_report.md` — how `Inventory DM-WN.xlsx` overlaps with every source. Regenerate: `python "WN manuals an files/overlap_inventory_dmwn.py"`.
> - `WN manuals an files/sku_legacy_modern_map.csv` (+ `.json`) — legacy↔modern SAP cross-reference table. Regenerate: `python "WN manuals an files/build_sku_legacy_modern_map.py"`.

---

## 1. SKU prefix taxonomy (Wacker Neuson Group SAP)

The Wacker Neuson Group uses a 10-digit SAP material number for current parts.
The **prefix digit indicates which product family** the part belongs to:

| Prefix       | Family                                     | What it covers                                               |
|--------------|--------------------------------------------|--------------------------------------------------------------|
| `0xxxxxxx`   | Legacy WN (7-digit, pre-SAP)               | Older construction equipment                                 |
| `5xxxxxxxxx` | **WN light construction (SAP)**            | Compaction (plates, rammers), pumps, lighting, heating, power supply, demolition breakers, concrete technology, generators |
| `1xxxxxxxxx` | **WN Group big-equipment + agricultural (SAP)** — Wacker EZ-series mini excavators (Zero Tail), TH-series telehandlers, larger excavators, wheel loaders, dumpers; Weidemann Hoftracs; Kramer wheel loaders |

> **Important correction (2026-06-24):** The `1xxxxxxxxx` prefix is **not**
> "Weidemann/Kramer agricultural only" — that was the initial hypothesis based
> on the Neyer catalog. Subsequent verification on the WN EZ80 mini excavator
> (`/shop-by-brand/wacker.html` → "Wacker Zero Tail Mini Excavator Parts"
> shows all parts with `1000xxxxxx` SKUs) and on TH627 telehandlers proved the
> prefix is shared across the entire WN Group's post-SAP big-equipment +
> agricultural range. The reason eParts portal has empty BOMs for the
> 96 big-equipment machines is **distribution restriction** (dealer-only),
> not separate numbering.

### Why this matters

Our current OEM catalog (`OemPart` table) came from:
- `shop.wackerneuson.com/eparts` API (572 machines) — almost entirely `5xxxxxxxxx` and `0xxxxxxx`
- 2,200 Wacker Neuson PDFs (after Phase 4 download on 2026-06-24) — same prefix mix

So **our catalog covers WN light construction only**. The big-equipment
families (excavators, telehandlers, wheel loaders, dumpers, attachments,
skid steers — 96 machines, all `1xxxxxxxxx`) and the Weidemann/Kramer
agricultural families are not represented in our BOM tables. Coverage there
depends on **retailer-derived data** (Neyer, LS Engineers, DHS) — see §6
below.

---

## 2. Source: Neyer.de (`neyer.de/en/collections/weidemann-kramer-parts`)

**Discovered 2026-06-24.** Despite the collection name, the URL handles are all
`wackerneuson-<sku>` — this confused us initially.

| Metric                                                | Value         |
|-------------------------------------------------------|---------------|
| Sitemap-derived unique SKUs                           | 45,584        |
| Of those starting with `1xxxxxxxxx` (Weidemann/Kramer)| 45,579 (99.99%) |
| Overlap with our OEM catalog (44,894 SKUs)            | **5** (0.01%) |

**Conclusion: Neyer's "weidemann-kramer-parts" collection is exactly that —
Weidemann + Kramer parts.** The `wackerneuson-` URL prefix is just because they
all live under the parent group name. There is essentially zero overlap with the
construction-equipment catalog we already have.

### What Neyer IS good for

If/when we add Weidemann or Kramer machines to `OemMachine`, the 45K Neyer rows
become rich enrichment data — titles, descriptions, images, "Replaces" cross-refs,
prices (EUR). The deep-crawl script (`scrape_neyer_full.py`) produces a JSONL
with all of that and is loadable via `prisma/seed-oem-listings.ts` →
`OemPartListing` (source = `neyer-en`).

### What Neyer is NOT good for

- ❌ Pricing source for our existing 44,894 OEM parts — five matches only.
- ❌ Discovering "missing" Wacker construction parts — different number range.

---

## 3. Source: Weidemann eService (`service.weidemann.de/catalogcreator`)

**Discovered 2026-06-24.** Dealer-gated (we have a session). Docware
CatalogCreator platform, 18 catalogs (`10er_Serie` through `90er_Serie_TL`, plus
Diverses, Frontanbaugeraete, Heckanbaugeraete, Motoren_zerlegt,
Nachruestsaetze).

API shape (same family as the Wacker Neuson eParts API):
- `action.php?func=load&catalog=N` — sets session's current catalog
- `action.php?func=printAssembly&id=N` — returns HTML (branch or leaf parts table)

Sampled catalog 3 (13er_Serie) ids 1–500:
- 2,313 unique `1xxxxxxxxx` SKUs
- 60.6% of them also in the Neyer 45K set

**Same SAP number range as Neyer** (`1xxxxxxxxx`), confirms the cross-brand
identity. Weidemann's eService is the matching BOM-and-diagrams source for the
machines whose parts Neyer is reselling.

### Decision point: do we ingest Weidemann?

**Yes — confirmed by inventory analysis 2026-06-24.** The user's
`Inventory DM-WN.xlsx` is **46% Weidemann/Kramer parts** (1,094 of 2,371 stocked
SKUs are `1xxxxxxxxx`). That's not a future concern — it's nearly half of
present-day stock that has zero BOM/diagram coverage in our catalog. See
**section 5 (Inventory reality check)** below for the full numbers.

Plan when scheduled:
1. Walk all 18 catalogs with `scrape_weidemann_catalog.py` (now unparked) using
   the dealer session captured during recon
2. Ingest into `OemMachine` / `OemMachineRevision` / `OemComponent` / `OemPart`
   with `source = WEIDEMANN_ESERVICE` (new enum value to add)
3. Use Neyer's 45K `OemPartListing` rows (already prepared via
   `seed-oem-listings.ts`) as enrichment for the resulting parts

Scraper: `WN manuals an files/scrape_weidemann_catalog.py`.

---

## 4. Retailer price sources (current: 10 retailers)

All store-front scrapers feed `prisma/seed-part-prices.ts` →
`PartPriceSnapshot`. CSVs live in `WN manuals an files/`. Counts below are the
actual unique `part_number` values in each CSV.

| Retailer            | Platform     | CSV file                        | SKUs    | Brand mix¹ | Notes |
|---------------------|--------------|---------------------------------|--------:|------------|-------|
| dhs                 | Klevu        | `wn_dhs_klevu.csv`              | 144,274 | Multi-brand (WN constr + Weidemann/Kramer + aftermarket) | Biggest single source; covers 84.6% of stocked inventory |
| neyer (sitemap)     | Shopify      | `wn_neyer.csv` (+ `neyer_skus_all.txt`) | 45,584 | 100% Weidemann/Kramer (`1xxx`) | 25K via CSV (pagination cap); 45.5K via sitemap walk |
| hydrotech           | Shopify      | `wn_hydrotech.csv`              |  24,983 | WN construction-heavy | Wide catalog but only 3% of stocked inventory |
| danseusa            | Shopify      | `wn_danseusa.csv`               |  17,491 | WN construction | |
| tmsequip            | ConvertCart  | `wn_tmsequip_full.csv`          |  10,000 | WN construction | Capped at 10K via ConvertCart; sitemap rerun pending |
| russopower          | Shopify      | `wn_russopower.csv`             |   1,214 | WN construction (~focused) | Punches above weight: 18.8% of its SKUs are in our stock |
| equipmentshare      | Shopify      | `wn_equipmentshare.csv`         |     370 | WN construction | |
| contractorsdirect   | Shopify      | `wn_contractorsdirect.csv`      |     116 | WN construction | |
| tiendamamsa         | Custom       | `wn_tiendamamsa.csv`            |      29 | Mixed | |
| everestparts        | Shopify      | `wn_everestpartssupplies.csv`   |       1 | — | Header fix: no `Accept-Language` (was returning 0); only 1 valid row |

¹ Brand mix derived from SKU prefix histograms; see `sku_overlap_report.md`.

### Surprise finding: DHS is multi-brand

DHS was originally tagged as a WN construction price source, but the cross-checks proved otherwise:
- Of 2,313 sampled Weidemann eService SKUs, DHS carries **1,894 (82%)**
- DHS carries 86,513 `1xxx`-prefix SKUs in total — almost 2× what Neyer alone has

Reclassify DHS as **multi-brand parts retailer**, not just WN construction.

**Pairwise overlap matrix:** see `WN manuals an files/sku_overlap_report.md` —
auto-regenerated by the analyzer script. That file is the canonical view of
which retailers overlap and by how much. Update it (not this section) when
adding a new retailer.

### Shopify 25K pagination cap

`/products.json` and the Storefront GraphQL API both refuse to paginate past
~25,000 items in a single collection. Workaround for large stores: walk the
sitemap (`sitemap_products_N.xml`) to get the full handle list, then hit
`/products/<handle>.json` per item. Implemented in `dedupe_neyer_sitemap.py` +
`scrape_neyer_full.py`. **Apply the same trick to tmsequip** (currently capped
at 10K via ConvertCart).

### New retailer queue (discovered 2026-06-24, not yet scraped)

| Retailer                          | Platform              | Why interesting | Status |
|-----------------------------------|----------------------|-----------------|--------|
| **`lsengineers.co.uk`**           | Magento (Cloudflare-protected) | Carries Wacker EZ-series excavators, TH-series telehandlers, dumpers, mini excavators — exactly the `1xxxxxxxxx` big-equipment families our eParts walk got 0 parts for. Pages are structured as **assembly catalogs** (BOM-style) with SKU + name + GBP price + image per part. ~22 top-level Wacker categories. URL pattern: `/wacker-<model>-<variant>-<machine-type>-parts.html` → `/<assembly-name>-for-wacker-<model>-<type>.html` → individual `/<slug>-oem-no-NNNNNN.html` part pages. Plain HTTP returns Cloudflare challenge — must scrape via Chrome MCP using live browser session. | **Scrape in progress 2026-06-24** (Chrome-MCP-driven, depth-bounded, strict `URL must contain "wacker"` filter, fetch cap 5,000). First-pass-halted snapshot: 1,964 parts / 661 distinct SKUs. Full run aims for ~5K+ assembly pages, expected 10–30K distinct Wacker SKUs. |
| **`wackerneusonparts.parts`**     | Unknown — needs recon | URL implies a dedicated Wacker Neuson parts site (`/collections/all-parts` looks like a Shopify collection path → likely Shopify). Worth recon for: (1) is it sanctioned/branded? (2) catalog scope (3) SKU prefix mix (4) overlap with our existing data. | **Not yet recon'd.** Start at `https://wackerneusonparts.parts/collections/all-parts`. If Shopify, the generic `scrape_shopify_collection.py` should handle it directly. |

---

## 5. Inventory reality check — `Inventory DM-WN.xlsx`

The user's stocked-items inventory has **2,555 rows**, of which **2,395** carry
a Wacker-shape SAP material number in the `Varenr. 2` column, giving
**2,371 unique SKUs**. This is what we actually need to cover.

### SKU prefix split

| Prefix      | Brand                       | Stocked SKUs | %    |
|-------------|-----------------------------|-------------:|-----:|
| `5xxxxxxxxx`| Wacker Neuson construction  |  1,276       | 54%  |
| `1xxxxxxxxx`| Weidemann / Kramer          |  1,094       | 46%  |
| `07d_legacy`| Legacy 7-digit              |      1       | <1%  |

Inventory is almost evenly split between construction and agricultural — the
two halves of the WN Group. **Weidemann/Kramer is not a future concern; it is
46% of present-day stock.**

### Coverage by source

| Coverage source                          | Stocked items covered | % of inventory |
|------------------------------------------|---------------------:|---------------:|
| OEM catalog (eParts API + 313 PDFs)      | 783                 | 33.0%          |
| +Resolved via legacy↔modern mapping (§6) | +31                 | +1.3%          |
| **Combined OEM coverage**                | **814**             | **34.3%**      |
| Retailer price listing (any of 10)       | 2,082               | 87.8%          |
| In `none` of our sources                 | 241                 | 10.2%          |

### Gap composition (what we don't yet cover for OEM/diagrams)

| Of the 1,557 stocked items still without OEM | Count |
|---------------------------------------------|------:|
| `1xxx` Weidemann/Kramer (need Weidemann eService) | **1,093** |
| `5xxx` WN construction (likely in unexposed eParts categories or unprocessed PDFs) | 463 |
| Legacy `0xxxxxx`                            |     1 |

### Per-retailer hit rate against your stock (top 5)

| Retailer        | Covers stocked items | % of stock |
|-----------------|---------------------:|-----------:|
| **dhs**         | 2,006               | **84.6%**  |
| neyer (45K)     | 410                 | 17.3%      |
| tmsequip        | 285                 | 12.0%      |
| danseusa        | 234                 | 9.9%       |
| russopower      | 228                 | 9.6%       |

DHS alone covers nearly 85% of stocked SKUs. If we keep one price refresh job
running, it's the DHS one. russopower is small but punches well above its
weight (18.8% hit-rate per SKU) — keep it warm.

> Regenerate this section's numbers any time with
> `python "WN manuals an files/overlap_inventory_dmwn.py"` →
> `inventory_overlap_report.md`.

---

## 6. Legacy ↔ Modern SAP cross-reference table

**Built 2026-06-24.** Wacker Neuson migrated from 7-digit `0xxxxxxx` part
numbers to 10-digit `5xxxxxxxxx` SAP material numbers. Different sources stayed
on different systems:

- PDFs (mostly 313 manuals in `wn_parts.sqlite`): **legacy `0xxxxxxx`** dominant
- shop.wackerneuson.com eParts API: **modern `5xxxxxxxxx`** only
- Retailer URL slugs (DHS, hydrotech, danseusa…): **both side-by-side**,
  e.g. `…exciter-shaft-0110185-5000110185`
- Your inventory: modern `Varenr. 2`, with legacy embedded in descriptions
  ("X-0201030 BOLT-MOUNTING")

The build mines pairs from every co-occurrence signal:

| Source signal                       | Pairs contributed |
|-------------------------------------|------------------:|
| DHS Klevu URL slugs                 | 33,384            |
| Hydrotech URL slugs                 | 15,954            |
| Inventory `X-NNNNNNN` cross-refs    | 7                 |
| Other retailer co-occurrence        | 20                |
| **Total distinct (legacy, modern) pairs** | **49,365**  |

- Distinct modern SKUs mapped: 48,464
- Distinct legacy SKUs mapped: 38,044

### What the mapping does and doesn't help with

| Use case                                          | Helpful? |
|---------------------------------------------------|----------|
| Bridging PDF data (legacy) ↔ eParts data (modern) | ✅ Big   |
| De-duplicating OemPart rows that exist under both numbers | ✅ Big |
| Resolving inventory items that lack OEM coverage  | ⚠️ Modest (+31 SKUs / +1.3%) |
| Resolving the 80 "truly unknown" stocked items    | ❌ 2 of 80 |

The mapping rescues parts that *were* renumbered during SAP migration. It can't
help with parts that are SAP-only (introduced post-migration, no legacy
equivalent) or Weidemann/Kramer (`1xxx`, separate numbering system entirely).

### Files

- [sku_legacy_modern_map.csv](../WN%20manuals%20an%20files/sku_legacy_modern_map.csv) — one row per pair, with source labels
- `sku_legacy_modern_map.json` — indexed both directions for lookup
- `sku_legacy_modern_map_report.md` — coverage summary
- `unknowns_5xxx_resolved.csv` — per-unknown resolution attempt

### Schema implication (future)

When we want to use this in production, add `legacyPartNumber String?` to
`OemPart` and populate it via the mapping. That lets a single OEM row carry
both numbers and surface either to users searching by SKU.

---

## 7. Decision matrix — which source for which need?

| Need                                          | Right source                                          |
|-----------------------------------------------|-------------------------------------------------------|
| Machine BOMs + click-hotspot diagrams (WN)    | `shop.wackerneuson.com/eparts` (`OemCatalogSource.EPARTS_API`) |
| Machine BOMs for older WN models              | The 313 PDFs (`OemCatalogSource.PDF`)                 |
| Pricing for WN construction parts             | DHS, hydrotech, danseusa, tmsequip, russopower         |
| Pricing for stocked items (DM-WN inventory)   | **DHS** (84.6% hit rate) > neyer > tmsequip > danseusa > russopower |
| Enrichment (title, image, description) for WN | The retailer CSVs (best names: dhs, hydrotech)        |
| Anything Weidemann / Kramer (agricultural)    | **`service.weidemann.de` + neyer.de** — confirmed in scope (46% of stock) |
| Big-equipment parts (Wacker EZ, TH, dumpers, loaders) | **`lsengineers.co.uk`** (Magento, Cloudflare; assembly-level structured catalogs, GBP prices) |
| Bridging old-PDF ↔ new-API part numbers       | `sku_legacy_modern_map.csv` (49K pairs)               |

---

## 8. Open data-source questions

- Is there a Kramer-side equivalent of `service.weidemann.de`? (haven't looked)
- Wacker Neuson dealer portal (`partsplus`) — gated, never tested whether we can get a login
- The 22 RC-series PDFs that failed extraction — are there alternative manuals from the WN service site? *(Resolved 2026-06-24 — re-extracted cleanly from today's larger Parts Manual download.)*
- **Where do the 80 truly-unknown stocked SKUs live?** They're in no retailer, no OEM, no Weidemann sample, and have no legacy equivalent in our mapping. Mostly look like HL/G-series light tower + heater equipment (530SE/535RSE control boxes, capacitors, P.E. cells) plus a DPU100-70 repair kit. The eParts portal may have a separate "Service Kits" or "Light Equipment" navigation branch our scraper didn't traverse — worth a Chrome-session recon.

## 9. Infrastructure TODOs

Reference targets we've committed to following (source docs:
`C:\Users\Ventura AI\Documents\3 layer database.docx` and
`C:\Users\Ventura AI\Documents\13 layer model.docx`).

### Three-environment database model (Dev / Staging / Prod)

We're currently in the "vibe-coding trap" the source doc warns against:
**everything points at prod**. The target model is three watertight
environments with their own data and rules.

| Env       | Purpose                                              | Data                          | Rules                                                    |
|-----------|------------------------------------------------------|-------------------------------|----------------------------------------------------------|
| **Dev**   | AI agents + humans write code, experiment, break things | Synthetic or anonymised only — **never real customer data** | Isolated; any destructive query is harmless              |
| **Staging** | Generalprøve — exact prod mirror without real users | Mirrored / anonymised, matching prod in structure + volume | Only CI/CD writes here (no manual edits). Broken Staging = blocked release. |
| **Prod**  | Live customer-facing system                          | Real production + sensitive personal data | Locked down: RLS enforced, continuous data-quality monitoring, only fully-tested CI/CD deploys reach it |

**Current state vs target:**
- Have one DB only (prod `nxqqmplptalbxmfmbtfs`); `iuimkzettrrqvvvgfvqp`
  exists but is orphaned + under a different Supabase account
- No staging env at all
- No CI/CD pipeline gating deploys
- No RLS policies enforced yet
- Migration `20260624200000_oem_compat_legacy_enums` applied to prod only

**Decisions needed:**
- (a) Wake `iuimkzettrrqvvvgfvqp`, bring under prod's Supabase org, designate
  as Dev; provision a third project as Staging; rotate `.env` →
  `.env.local` (dev), `.env.staging`, `.env.production`
- (b) Provision two fresh projects under prod's org and discard the orphan
- (c) Decide we only need 2 envs (skip staging) — not what the source doc
  recommends

### Thirteen-layer production stack

Source doc's claim: most AI-built apps stop at layers 1-3; the other 10 layers
separate a prototype from a 10,000-user production system. We should
explicitly target every layer for the storefront. Coverage today:

| Layer | Concern | Status |
|-------|---------|--------|
| 1. Frontend foundations | UI + state | 🟡 Partial — Next.js 16 app exists; v4.2 redesign in progress |
| 2. APIs & backend logic | Server logic, API routes | 🟡 Partial — Next.js route handlers exist |
| 3. Database & Storage | Schema + persistence | 🟢 Active — Postgres via Supabase, Prisma 7. Supabase Storage not yet used (eparts_assets/ + drawings/ are still local) |
| 4. Auth & permissions | User identity + access control | ❌ Not yet set up |
| 5. Hosting & deployment | Where the app runs | 🟡 Vercel (assumed — needs confirmation) |
| 6. Cloud & compute | Infra primitives | 🟡 Supabase + Vercel |
| 7. CI/CD & version control | Automated test/deploy gates | ❌ Only git + manual `npx prisma migrate deploy`; no automated pipeline |
| 8. Security & RLS | Data-level access control | ❌ No RLS policies on any OEM tables yet |
| 9. Rate limiting | API abuse protection | ❌ Not configured |
| 10. Caching & CDN | Latency + global performance | 🟡 Vercel CDN by default; no DB-layer caching |
| 11. Load balancing & scaling | Traffic distribution | 🟡 Vercel auto-scales serverless |
| 12. Error tracking & logging | Crash detection (e.g. Sentry) | ❌ Not configured |
| 13. Availability & recovery | Backups + disaster recovery | 🟡 Supabase point-in-time recovery (default) |

**Net read:** layers 3 (DB schema) and 1-2 (frontend/backend) are alive; **almost everything else is either default Vercel/Supabase behaviour or missing**. The orphaned dev DB, missing RLS, missing CI/CD pipeline, and missing error tracking are the largest concrete gaps.

### Concrete actions queued

- [ ] Decide dev/staging/prod plan (a / b / c above)
- [ ] Migrate schema to the chosen dev + staging DBs (replay `20260624200000_oem_compat_legacy_enums` + earlier migrations)
- [ ] Switch `.env` from a single prod URL to `.env.local` / `.env.staging` / `.env.production`
- [ ] Add a CI/CD pipeline that runs `prisma migrate deploy` on staging on every merge to `main`, then prod on tag
- [ ] Define + enable RLS policies on the OEM tables (`OemMachine`, `OemPart`, `OemPartListing`, `OemPartCompatibility`, etc.)
- [ ] Wire Sentry (or equivalent) for layer 12
- [ ] Document this stack target in `docs/handoff.md` as the canonical "where the app should be" reference

---

## Changelog

- **2026-06-24** Initial KB created. Documented SKU prefix taxonomy after the
  Neyer/OEM cross-check returned 5 matches out of 45K — turned out Neyer is the
  Weidemann/Kramer (`1xxxxxxxxx`) side, our catalog is construction
  (`5xxxxxxxxx` + `0xxxxxxx` legacy).
- **2026-06-24** Added §5 (inventory reality check) after cross-checking
  `Inventory DM-WN.xlsx`: 46% of stocked items are Weidemann/Kramer, current OEM
  catalog covers 33% direct + 1.3% via mapping. Weidemann ingestion flipped
  from "deferred" to **confirmed in-scope**.
- **2026-06-24** Added §6 (legacy↔modern SAP cross-reference). Built 49,365
  distinct pairs by mining retailer URL slugs (DHS contributed 33K, hydrotech
  16K) + inventory descriptions. Useful for PDF↔eParts catalog unification; of
  modest help for inventory gap.
- **2026-06-24** Reclassified DHS from "WN construction price source" to
  **"multi-brand"** after discovering it carries 86,513 `1xxx` Weidemann/Kramer
  SKUs (82% of a Weidemann eService sample) on top of its WN construction
  coverage. DHS is now the single best price source for stocked inventory
  (84.6% hit rate).
- **2026-06-24** **Corrected §1 SKU taxonomy.** `1xxxxxxxxx` is *not*
  Weidemann/Kramer-only — it's the WN Group post-SAP numbering for the entire
  big-equipment + agricultural side: WN EZ-series mini excavators, TH-series
  telehandlers, larger excavators, wheel loaders, dumpers, attachments, plus
  Weidemann + Kramer. Verified on EZ80 (`/wacker-zero-tail-mini-excavator-parts.html`
  → 56 SKUs, 100% `1000xxxxxx`) and TH627. This means the 96-machine
  big-equipment gap in our catalog is roughly the same population as the
  `1xxxxxxxxx`-coverage gap.
- **2026-06-24** Added two retailers to the queue:
  **`lsengineers.co.uk`** (Magento + Cloudflare, structured assembly-level
  catalogs for Wacker EZ/TH/excavators/telehandlers — Chrome-MCP scrape in
  progress) and **`wackerneusonparts.parts`** (likely Shopify, not yet
  recon'd). See §4 → "New retailer queue".
