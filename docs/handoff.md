# Session handoff — IndustriParts v4.1 work

**As of 26 June 2026 (end of session).**

> **The OEM-parts catalog is now its own sub-project** — separate Supabase
> project (`rtzcrngduscrhgozrojv` under BojoIndAI1 org), separate Prisma
> schema (`prisma/oem/`), separate Prisma client (`src/lib/oem-db.ts`).
>
> **For ALL OEM-catalog work — Tier 1 (eParts) / Tier 2 (LS Engineers) /
> Tier 3 (Neyer + DHS) — the canonical plan is
> [`docs/oem/PLAN.md`](oem/PLAN.md).** Read that file for OEM phase
> status, next steps, and follow-up backlog. The 25-26 June sections
> below are historical context — superseded by the plan doc.

Phases 0–9 of the Dyvika storefront live in production. v4.2 storefront
redesign still queued unchanged. OEM catalog BOM walk is **in progress**
(see § below).

## End-of-session state (29 June) — LS ingest extended + Weidemann walk started

### What happened this session (29 June)

| Area | Outcome |
|---|---|
| **eParts BOM walk** | Restarted from checkpoint (~3,265/5,632). Completed fully — all machines walked. |
| **LS Engineers Phase 2 — Dumpers** | `scripts/oem-ingest/lsengineers/02-dumpers.ts` written + run. 15 models (Track + Wheel), 17 revisions, 259 diagrams, 4,203 part lines. TD9→TD09 normalised; DT08 pro + TD15-3S matched. |
| **LS Engineers Phase 2 — Telehandlers** | `scripts/oem-ingest/lsengineers/03-telehandlers.ts` written + run. 32 models, 37 revisions, 1,977 diagrams, 50,246 part lines. Serial-range slugs (th730-415-04 → "TH730 (415-04)") matched via displayName. |
| **Weidemann BOM walk** | `scripts/oem-ingest/weidemann/01-bom-walk.ts` running via PHPSESSID cookie (Node script, no browser dependency). Session cookie: `19cbtjhj728ac1pimickanb425` (will expire — get a fresh one after restart). Writes per-machine JSONL files to `data/weidemann_raw/` immediately — no data loss on restart. |
| **OEM explorer** | `http://localhost:3000/oem-explorer` confirmed working (needs `npm run dev`). |
| **Storage numbers confirmed** | DB ~2 GB local. After 7-phase dedup: ~165 MB. Plan published. |
| **BOM source tracking** | `MachineRevision.bomSource` enum: EPARTS_API, LSENGINEERS. Weidemann TBD on ingest. |
| **Candidate BOM sources** | Swepac (`spareparts.swepac.com`) added to memory. Kramer likely same CATALOGcreator system as Weidemann. |

### LS Engineers — ingested categories as of 29 June

| Category | Script | Revisions | Diagrams |
|---|---|---|---|
| Mini Excavator Parts | `01-excavators.ts` | 104 | ~4,360 |
| Track Dumpers + Wheel Dumpers | `02-dumpers.ts` | 17 | 259 |
| Telehandlers | `03-telehandlers.ts` | 37 | 1,977 |
| Vibrating Roller Parts | ❌ not written | 0 | 0 |
| Tower Light Parts | ❌ not written | 0 | 0 |
| Compaction, Concreting, etc. | ❌ not written | 0 | 0 |

All remaining LS data is already in `data/lsengineers_diagrams.jsonl` — just need ingest scripts modelled on `01-excavators.ts`.

### Weidemann walk — state on restart

- **Script:** `scripts/oem-ingest/weidemann/01-bom-walk.ts`
- **Output dir:** `data/weidemann_raw/` — one JSONL file per machine assembly, written immediately
- **Resume:** script has no checkpoint — re-runs from catalog 0. Already-written files get overwritten (idempotent). No data loss.
- **Session cookie:** will have expired. Log in at `https://service.weidemann.de`, copy `PHPSESSID` from Chrome DevTools → Application → Cookies → service.weidemann.de. Then:
  ```powershell
  cd "C:\Users\Ventura AI\Documents\industriparts"
  $env:WEIDEMANN_SESSION = "paste-new-cookie-here"
  npx tsx scripts/oem-ingest/weidemann/01-bom-walk.ts
  ```
- **Known issue:** assembly names render as `&nbsp;` HTML entities — the script needs `decodeEntities` pass on `assembly.name` before saving. Low priority — names are cosmetic.
- **ETA:** ~30–60 min for all 21 catalogs at 200ms/assembly.

### 7-phase DB restructuring plan (current Phase 1)

Full plan at bottom of this section + in memory file. Phase 1 (complete ingest) is in progress. Phases 2–7 blocked on Phase 1 completion.

| Phase | Status |
|---|---|
| 1 — Complete ingest (eParts + LS + Weidemann) | 🟡 Weidemann walk in progress |
| 2 — Add partsHash + canonicalDiagramId to schema | 🔴 blocked |
| 3 — Backfill partsHash | 🔴 blocked |
| 4 — Mark canonical diagrams | 🔴 blocked |
| 5 — Delete duplicate PartLines (7.7M → 263K) | 🔴 blocked |
| 6 — Image deduplication | 🔴 blocked |
| 7 — Push to Supabase OEM | 🔴 blocked |

---

## End-of-session state (26 June) — BOM walk running + DB cleanup complete

### BOM walk in progress

`scripts/oem-ingest/eparts/03-bom-walk.ts` is running as a background process,
walking eParts component API for all 4,412 canonical machines in
`data/eparts_v2/_sidebar_4412.json`. Progress is checkpointed to
`data/eparts_v2/_bom_walk_progress.json`. **It writes directly to local
PostgreSQL** (`oem_catalog` DB on localhost:5432) — not to Supabase.

Status when session ended: **~1,105 / 4,412 machines done, ~70 errors (frozen),
~14 hours remaining**. The script is idempotent — skips codes already in
`done[]` — so it can be killed and restarted safely.

Key BOM walk architecture decisions:
- **5xxx machine codes** use `products/{code}` → revisions → devices → component endpoint
- **1xxx machine codes** (big equipment) use `nonRevMachine/{code}` → sparepartsBookList
  (PDF only — no interactive BOM available from eParts for these)
- Approx. **4,000 machines** will yield interactive BOMs; the rest are PDF-only
- **Service Kit / Maintenance Kit** part numbers do NOT appear in eParts BOMs — that data
  will come from Parts Manual PDFs in a later phase
- P2002 race conditions (5 concurrent workers) are handled with try/catch → findUnique fallback

After the walk: the local DB will hold the full tier-1 BOM dataset, ready for a
curated push to Supabase OEM.

### Database state after this session

| DB | Size | State |
|---|---|---|
| **Local PostgreSQL** (`oem_catalog`) | ~growing | PRIMARY OEM store — all data (eParts BOM + transferred data) lives here |
| **Supabase OEM** (`rtzcrngduscrhgozrojv`) | ~11 MB | Schema intact, data **truncated** — all rows transferred to local first, then cleared. Ready for final curated push after BOM walk. |
| **Supabase main app** (`nxqqmplptalbxmfmbtfs`) | ~13 MB | OEM tables **dropped** this session (freed ~695 MB). Only storefront schema remains. |

### What was done this session (infra cleanup)

| Area | Outcome |
|---|---|
| **Three-DB architecture documented** | `CLAUDE.md` now has full DB architecture section: two Supabase accounts, three targets, Prisma configs, env vars, npm scripts, MCP tools |
| **npm scripts** | Added `oem:generate` / `oem:push` / `oem:migrate` / `oem:studio` to `package.json` alongside existing `db:*` scripts |
| **`.env` / `.env.local` pattern** | `.env` = Supabase defaults. `.env.local` (gitignored) = local PostgreSQL override. Scripts use two-step dotenv load. |
| **`supabase-oem` MCP added to Claude Desktop** | `~\AppData\Roaming\Claude\claude_desktop_config.json` — stdio server via `npx @supabase/mcp-server-supabase@latest --access-token sbp_02058757...` (BojoIndAI1 PAT). Use `mcp__supabase-oem__execute_sql` in Claude Desktop sessions. |
| **`~/.claude/mcp.json`** | Updated PAT to BojoIndAI1 account token (HTTP MCP for Claude Code CLI sessions) |
| **Transfer script** | `scripts/oem-ingest/04-transfer-from-supabase.ts` — 4-pass idempotent transfer from Supabase OEM → local PG (PDF Machines, PartPriceSnapshot, PartCompatibility, PartListing). FK remapping via natural keys. |
| **Main app DB cleaned** | Dropped all OEM-prefixed tables + PartPriceSnapshot from `nxqqmplptalbxmfmbtfs`. Main app is now clean storefront-only. |
| **Supabase OEM truncated** | All non-eParts rows transferred to local, then TRUNCATE CASCADE on all OEM tables. Schema intact. |
| **BOM walk script fixed** | `03-bom-walk.ts`: Prisma 7 adapter pattern, P2002 fallback, correct relative import path, `diagramData` object extraction (`.filename` / `.id`), `mode: "NUMERIC"` required field |

### Next steps after BOM walk completes

1. **Check walk stats** — `data/eparts_v2/_bom_walk_progress.json` has `done[]`, `errors[]`, counts
2. **Phase 1.4-recon** — the local DB still has OEM DB rows from the old 5,002-machine set (over-permissive). After walk, reconcile against the canonical 3,427 sidebar set from `_catalog_v3.json`
3. **Push curated data to Supabase OEM** — once local DB is clean, migrate to the Supabase project for production use
4. **PDF kit extraction** — service kits / maintenance kits don't appear in eParts BOM; extract from Parts Manual PDFs
5. **Phase 2: LS Engineers** — BOM fill for big-equipment where eParts has no interactive BOM
6. **Phase 3: Neyer + DHS enrichment** — re-run with larger Part catalog

## Mid-session (26 June) — supabase-oem MCP + BOM analysis

### New MCP server added

`~/.claude/mcp.json` created with a `supabase-oem` entry authenticated via BojoIndAI1 PAT. This gives Claude Code direct SQL
access to OEM project `rtzcrngduscrhgozrojv`. **Requires Claude Code restart to activate**
— on first startup after restart, approve the `supabase-oem` server when prompted.

Once live, query OEM DB like this (use the `supabase-oem` MCP tool, project id `rtzcrngduscrhgozrojv`):
```sql
SELECT COUNT(*) FROM "Machine";
SELECT COUNT(DISTINCT "machineId") FROM "Diagram";
```

### BOM coverage analysis in progress

We were mid-query establishing how many of the 3,427 canonical machines actually have
BOM data in the OEM DB. The per-machine JSON files in `data/eparts_v2/` only hold
catalog metadata — actual BOM (Diagram/PartLine rows) lives in the OEM DB.

**Known from OEM DB ETL (25 June):** the ETL migrated data from the OLD 572-machine walk:
- 1,046 Machines, 3,542 Revisions, 83,223 Diagrams, 34,774 Parts, 1,327,284 PartLines

**Question to answer after restart:** how many of the 3,427 canonical machines have
Diagram rows in the OEM DB right now? Run:
```sql
SELECT
  COUNT(DISTINCT m.id) AS total_machines,
  COUNT(DISTINCT d."machineId") AS machines_with_diagrams,
  COUNT(DISTINCT m.id) - COUNT(DISTINCT d."machineId") AS machines_no_diagrams,
  COUNT(d.id) AS total_diagrams
FROM "Machine" m
LEFT JOIN "Diagram" d ON d."machineId" = m.id;
```

### Category breakdown confirmed

Old 572-machine walk vs canonical 3,427 — the delta is almost entirely small-equipment:

| Category | 572 walk | 3,427 walk | Delta |
|---|---:|---:|---:|
| Compaction | 93 | 1,081 | +988 |
| Concrete Technology | 163 | 655 | +492 |
| Power Supply | 64 | 490 | +426 |
| Pumps | 40 | 342 | +302 |
| Demolition | 50 | 249 | +199 |
| Lighting | 20 | 203 | +183 |
| Heating | 46 | 180 | +134 |
| Dumpers | 12 | 49 | +37 |
| Wheel Loaders | 17 | 52 | +35 |
| Excavators | 24 | 58 | +34 |
| Telehandlers | 5 | 32 | +27 |
| Skid Steer Loaders | 27 | 36 | +9 |
| Attachments | 11 | 3 | -8 |

The 572-machine walk captured most big-equipment (Excavators/Telehandlers) but missed
massive swaths of small-equipment variants.

---

Next up — pick one:
- **v4.2 storefront redesign** — three PRs in
  `docs/v4.2-redesign-plan.md`, decisions locked, unchanged from
  11 May. ~7 h.
- **OEM Parts — Phase 1.4-reconcile FIRST**, then Phase 1.5. The OEM DB
  currently has 5,002 Machine rows from the over-permissive
  `sapMaterialType:Machine` facet walk; the **canonical sidebar set is
  3,427** machines per the 26 June recon. Phase 1.4 needs to be redone
  (or delta-reconciled) against `data/eparts_v2/_catalog_v3.json`
  before BOM walking starts. See [`docs/oem/PLAN.md`](oem/PLAN.md)
  §Phase 1.4-recon (new step).

## Quickstart for a new owner

1. **Read this file top to bottom** for project-wide context. Then:
2. [`oem/PLAN.md`](oem/PLAN.md) — **canonical OEM Parts plan**; read
   if any OEM-catalog work is on the agenda.
3. [`oem/README.md`](oem/README.md) — OEM sub-project entry point;
   data-sources, ETL runbook, post-ETL drop runbook all linked from
   here.
4. [`v4.2-redesign-plan.md`](v4.2-redesign-plan.md) — the queued
   redesign work, decisions, file-by-file plan, time estimates.
5. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) —
   the upstream master plan (phases 0-9).
6. [`route-stub-registry.md`](route-stub-registry.md) — known route
   stubs (`/kampanjer`, `/info/finn-lager`).

Codebase is on `main` at `dc9c4cf` — production Railway tracks it and
is live. Branch `phase-oem-catalog` (23 June) is committed at `80a33e4`
but **not merged**; nothing has been pushed to production since 11 May.

## 26 June session — Canonical eParts machine list discovered

**Headline:** the 25 June Phase 1.4 catalog sync used the OVER-PERMISSIVE
`sapMaterialType:Machine` global facet (4,338 entries). That included
~900 RENTAL FLEET / regional / non-public variants that don't appear in
the eParts sidebar. The **canonical sidebar set is 3,427 machines** —
discovered by walking each leaf category with
`products/search?:category:LEAF_ID:sapMaterialType:Machine`.

User trigger: noticed that the OEM DB had **28 M2500 entries** including
e.g. `M2500-SM7S-H65 RENTAL FLEET_5100027158`, while the eParts sidebar
shows only **3 actual M2500 machines** (5100010890, 5100006000,
5100009717 — `Concrete Technology > Internal Vibrators > Modular
Internal Vibrators`).

### What was tried, what works

| Endpoint / facet | Count | Verdict |
|---|---|---|
| `/navigation/categories/{id}.products[]` (old walk) | 572 | UNDER-permissive — misses EZ excavators, ET, 803, TH telehandlers entirely. Curated set only. |
| `/products/search?:name-asc:sapMaterialType:Machine` (25 June Phase 1.4 walk) | 4,338 | OVER-permissive — includes RENTAL FLEET, regional configs, parts mis-tagged as Machine. |
| `/products/search?:category:LEAF:sapMaterialType:Machine` per leaf, union | **3,427** | **✅ canonical** — matches sidebar. RENTAL FLEET variants are tagged Machine but NOT assigned to any category, so they drop out automatically when category is filtered. |

### Bootstrap-endpoint search came up empty

Probed 16 candidate paths for a single-call "give me the whole sidebar"
endpoint (`/navigation/tree`, `/menu`, `/sidebar`, `/all-machines`, etc.)
— all 404. The `/eparts/` page itself is a 3.6 KB SPA shell with no
embedded data. So the SPA does what we now do: walks every leaf with
`products/search?:category:LEAF`. There is no shortcut.

### Outputs landed today

| File | What |
|---|---|
| `data/eparts_v2/_categories_walk.json` | Full category tree (146 nodes, 106 leaves, paths preserved) |
| `data/eparts_v2/_catalog_v3.json` | **3,427 distinct machines + category paths** — canonical input for Phase 1.4-recon |
| `data/recon_eparts_categories.py` | Tree walker |
| `data/walk_eparts_canonical_v3.py` | Leaf × Machine facet walker |

### What still needs to happen

The current OEM DB (`rtzcrngduscrhgozrojv`):
- 5,002 Machine rows total
  - 4,338 from the over-permissive Phase 1.4 walk (includes ~911 rental/regional pollution)
  - 664 PDF-source from older ETL (no displayName / modelName)
- Canonical target: 3,427 — full category paths attached

**Decision needed:** reconcile delta (faster, ~30 min) OR re-do Phase
1.4 cleanly from `_catalog_v3.json` (cleaner, ~1 h). See
[`docs/oem/PLAN.md`](oem/PLAN.md) §Phase 1.4-recon for the two options.
**This must complete before Phase 1.5 (BOM walk) starts** — we don't
want to walk BOMs for the ~911 non-canonical machines.

## 25 June session — OEM Parts split into its own sub-project

Headline: **OEM-catalog data is no longer in Dyvika prod's database.** It
lives in a new Supabase project (`rtzcrngduscrhgozrojv` under the
BojoIndAI1 org) on its own schema. Dyvika prod's 500 MB free-tier ceiling
no longer constrains the OEM data growth.

Why: prod hit **806 MB on the 500 MB free quota** and went into read-only
mode mid-session, killing the DHS fitment seed at 62%. Pro upgrade was an
option ($25/mo); we chose Path 2 (separate free-tier project under a new
org) to keep Dyvika prod free-tier and isolate the OEM data growth from
the storefront DB.

### What landed today

| Area | Outcome |
|---|---|
| New OEM Supabase project | `rtzcrngduscrhgozrojv` (BojoIndAI1's Org, free tier, eu-west-3 Paris) created + connection strings wired into `.env` as `OEM_DATABASE_URL` / `OEM_DIRECT_URL` |
| Lean Prisma schema | `prisma/oem/schema.prisma` + `prisma/oem/prisma.config.ts` — normalized Part/PartLine/Machine/Revision/Diagram/Listing/Compat/PriceSnapshot. DDL applied to new DB via direct `prisma migrate diff` + node-pg execute (Prisma CLI was misbehaving with the new config). |
| Prisma client | `src/app/generated/oem-prisma/` + singleton at `src/lib/oem-db.ts` |
| ETL from prod | 8-phase migration (`scripts/oem-etl/phase-1..8.ts` + `verify.ts`) moved tier-1 (eParts) data: **1,046 Machine, 3,542 MachineRevision, 83,223 Diagram, 34,774 Part (deduped from 1.38M OemPart via legacy↔modern map), 1,327,284 PartLine, 291,611 PartCompatibility, 5,061 PartListing, 200,386 PartPriceSnapshot.** Tier-2 (LS Engineers) and tier-3 (Neyer/DHS enrichment) deliberately NOT ingested — sequence per [PLAN.md](oem/PLAN.md). |
| eParts re-enumeration | `data/eparts_v2/` — 4,338 machines discovered via `sapMaterialType:Machine` facet (vs prior 572). Each machine enriched with per-revision `hasBomTree`, partsManuals[], operatingManuals[]. |
| **Phase 1.4 catalog sync ran** | `scripts/oem-ingest/eparts/01-catalog-sync.ts` upserted eparts_v2 → OEM DB. **OEM DB now holds 5,002 Machines (+3,956) and 20,784 MachineRevisions (+17,242).** 690 dropdown entries skipped as accessory/sibling-nav for Phase 1.4b. 664 PDF-source Machines from older ETL have NULL displayName — backfill in Phase 1.4c. |
| Sibling-machine pattern discovered | TH-series and similar big-equipment machines list **sibling models in the dropdown** (TH627's dropdown shows TH625/TH408/TH522/TH744 etc). NOT accessories — they're nav shortcuts. Phase 1.4b distinguishes via sparePartListCode lookup against existing Machine rows. |
| Excel export | `scripts/oem-utils/export-machines-xlsx.py` produces `data/exports/oem-machines.xlsx` (3.2 MB, two sheets) for human review of Machine + MachineRevision data. |
| PDF coverage audit | 18,658 parts manuals advertised by eParts; **1,491 on disk (8%); 17,167 missing (~83 GB).** Operating manuals: 9,114 advertised, 0 on disk (~99 GB). |
| Folder reorg | `WN manuals an files/` → `data/`; OEM docs moved into `docs/oem/`; 15 file references updated |
| Master plan | [`docs/oem/PLAN.md`](oem/PLAN.md) — 10 phases, ~80 steps, with status legend |

### Open follow-ups all rolled into the OEM PLAN

Every OEM-related TODO from the 23-24 June sessions has been migrated
into [`docs/oem/PLAN.md`](oem/PLAN.md) with a specific phase reference.
The PLAN.md "Open follow-ups inherited from earlier sessions" section
maps each old TODO to its new phase. **Don't add new OEM TODOs here —
edit PLAN.md.**

### Database state after today

| | Dyvika prod (`nxqqmplptalbxmfmbtfs`) | OEM (`rtzcrngduscrhgozrojv`) |
|---|---|---|
| Tier / org | Free / Dyvikamaskin | Free / BojoIndAI1 |
| Size today | ~806 MB (READ-ONLY due to disk full) | ~250 MB |
| Tables | All Dyvika storefront + **still has Oem\* tables** (haven't dropped yet — Phase 7 in PLAN.md) | All new lean-schema tables, populated tier-1 |
| Next op | DROP the Oem\* tables when Phase 1+3 of OEM PLAN are done → frees ~700 MB → back under quota | Continue ingest per PLAN.md Phase 1 |

### Decisions resolved this session

- **OEM-catalog architecture: Path 2** (separate Supabase project, no
  HTTP layer, direct cross-DB Prisma reads).
- **Data tier order: strict 1 → 2 → 3.** Don't ingest tier 2 until tier
  1 is complete; don't create stub Parts until tier 1+2 are done and we
  know the residual gap.
- **OEM client integration:** second Prisma client in same codebase
  (`src/lib/oem-db.ts`), NOT a separate API service.
- **Files:** sub-project layout inside the main repo, NOT a separate
  Git repo. Promote later if needed (e.g. licensing the catalog to other
  dealers).
- **Operating manuals (~99 GB):** keep URLs only, fetch on demand. Don't
  download full bulk.
- **Stub Parts for orphan SKUs:** deferred to end of Phase 3, after tier
  1+2 reveal the true residual gap.

## 23 June session — v4.3 OEM-catalog data plumbing

Single new branch — `phase-oem-catalog @ 80a33e4`. Pure additive work:
adds five new tables for the manufacturer parts catalog (separate from
the sellable `Product` table); touches no existing tables; production
DB untouched.

### What landed (on the branch, not merged)

| File | Purpose |
|---|---|
| `prisma/schema.prisma` (+158 lines) | New enum `OemCatalogSource` + five models: `OemMachine`, `OemMachineRevision`, `OemComponent`, `OemPart`, `PartPriceSnapshot`. Plus `MachineMake.oemMachines[]` back-relation. |
| `prisma/migrations/20260623100000_phase_oem_catalog/migration.sql` | Five `CREATE TABLE`, one `CREATE TYPE`, 14 indexes, 4 FKs. Not yet applied. |
| `prisma/seed-oem-eparts.ts` | Reads `data/eparts/*.json` (572 files, 376 with data) + inlines `.hd3` click-coord JSON from `eparts_assets/`. Writes `OemMachine`/`Revision`/`Component`/`Part` with source=`EPARTS_API`. Idempotent on `(code, source)`. |
| `prisma/seed-oem-pdfs.ts` | Reads `prisma/draft/wn_parts_export.json` (regenerated from `wn_parts.sqlite`). Writes the same tables with source=`PDF` — separate rows because PDF and eParts SKU sets are only ~34% overlapping. |
| `prisma/seed-part-prices.ts` | Reads the seven retailer CSVs → `PartPriceSnapshot`. Admin-only competitive pricing snapshot table; **not exposed to the storefront**. |
| `prisma/draft/export_wn_sqlite.py` | One-line Python that converts `wn_parts.sqlite` → `wn_parts_export.json` for the PDF seed. |

Schema validate ✓, generate ✓, `npm run typecheck` ✓ on the branch.

### What's in `data/` (this session's working data)

Outside the repo (gitignored / untracked). Headlines:

- **`eparts/*.json`** — 572 machine JSONs from `shop.wackerneuson.com`
  eParts API. 376 with revisions / 196 empty (machines that have no
  parts book on the shop). 2,226 revisions, 48,315 components,
  954,146 part-occurrences, **28,316 unique part numbers**, 4,747
  unique HD diagram references.
- **`eparts_assets/`** — 575 MB. 4,747 HD PNGs + 4,747 `.hd3`
  click-coord JSONs, downloaded by `download_eparts_assets.py`.
  Targeted for Supabase Storage upload during the v4.3 feature build.
- **`pdfs_shop/`** — 1.8 GB. 372 parts-book PDFs from the same shop,
  fed by `download_wn_parts_pdfs.py` from `wn_catalogue.json`.
- **`wn_parts.sqlite`** — 365 manuals · 6,676 assembly groups ·
  **85,021 parts** · 2,590 recommended-spares (grew from 17/660/8,041
  during this session — 21× more models, 10× more parts).
- **7 retailer scrape CSVs** — total **200,387 rows / 161,243 unique
  SKUs**: hydrotech 25k, danseusa 17k, tmsequip 10k (ConvertCart cap),
  russopower 1.2k, dhs-brand 600, contractorsdir 170, **dhs-klevu
  145,901**. The Klevu API alone hit 144k uniques.
- **`data-handover.md`** — the working-data handoff. The "Next steps"
  section there has been migrated into "Open follow-ups → v4.3 OEM
  catalog" below — that's the canonical list now.

### Key findings worth keeping

- **PDF catalogs and eParts API are 66% disjoint.** Of 25,173 PDF
  SKUs + 28,316 eParts SKUs, only 8,595 overlap. The eParts API has
  19,721 SKUs the PDFs miss (newer components, deeper drilldowns); the
  PDFs have 16,578 SKUs the eParts API no longer publishes (older
  revisions, obsolete). **Keep both sources.** Union ≈ 44,894 unique
  part numbers from machine data, plus the 161k retailer SKUs gives
  ~173k total unique parts in the system.
- **eParts has multiple revisions per machine** (BPU 2540A has 13).
  Components can change between adjacent revs even when the
  device-level `revisionLevel` is unchanged — fetched 247 distinct
  component URLs for one 9-revision machine. The schema reflects this
  with the `OemMachineRevision` child table (one row per
  machine × revision).
- **eParts component endpoints expose HD diagrams + click hotspots.**
  Each component returns a PNG filename + `.hd3` JSON with
  `(callout_id, x1, y1, x2, y2)` rectangles. This enables the v4.3
  interactive parts viewer with bidirectional callout ↔ row
  highlighting. The `.hd3` files are tiny (~1 KB) and inlined directly
  on `OemComponent.hotspotsJson` during seed.
- **shop.wackerneuson.com is fully scrapable anonymously.** Two
  endpoints — `/ws/v2/amd/navigation/products/{code}` and
  `.../components/machine/{code}/revision/{rev}/component/{spc}` — no
  auth, CORS open, parallel-friendly.
- **Public storefront search APIs are 50-1000× bigger than the brand
  pages.** TMS Equipment hides 66k Wacker products behind ConvertCart
  (10k-cap reachable today). DHS Equipment hides 146k behind Klevu
  (fully reachable). The bare brand pages on those sites had only 72
  and 600 respectively.
- **Three Wacker SKU formats** cover 98% of all numbers we've seen:
  10-digit starting with 5 (SAP modern, ~56%), 7-digit starting with
  0 (legacy, ~32%), 10-digit starting with 1 (SAP materials, ~11%).

### Supabase state — both projects paused

At end of session, both Supabase projects (`nxqqmplptalbxmfmbtfs` prod
and `iuimkzettrrqvvvgfvqp` dev) returned connection timeouts. Free-tier
projects auto-pause after inactivity; opening either dashboard wakes
the DB in ~2 minutes. That's the blocker for actually running the
migration + seeds.

### OEM-catalog ingest — paused mid-flight 23 June ~21:35

Migration is applied to **prod** (`nxqqmplptalbxmfmbtfs`). Two of the
three seeds finished cleanly; eParts is partially done and paused
because the per-row upserts over the EU-West pooler are slow from
this machine even on the faster connection (~14 s per active machine).
The script is idempotent + has a fast-path skip; resuming tomorrow
just re-runs the same command.

#### Current DB state (verified 23 June 21:35)

| Table | Rows | Notes |
|---|---|---|
| `OemMachine` (source=PDF) | **344** | ✅ complete (21 PDFs shared codes; became extra revisions) |
| `OemMachine` (source=EPARTS_API) | **244** | ⏸️ 244 of 572 — re-run will fast-path these |
| `OemMachineRevision` | 1,406 | growing |
| `OemComponent` | 25,208 | growing |
| `OemPart` | **462,806 rows · 33,416 unique partNumber** | growing |
| `PartPriceSnapshot` | **200,386** across **7 retailers** | ✅ complete |

#### To resume tomorrow morning

```bash
# Just re-run the eParts seed. The fast-path skip in seed-oem-eparts.ts
# (commit on phase-oem-catalog) does ONE cheap COUNT per already-done
# machine and continues from where it left off. Idempotent.
npx tsx prisma/seed-oem-eparts.ts
# Estimated remaining wall time: ~60-90 min for the ~330 unprocessed machines.
```

If the pooler drops mid-run, just re-run — the next invocation skips
everything that's already landed and continues. No data corruption
risk, no manual cleanup needed.

After eParts finishes — verify counts (expect ~376 EPARTS_API
machines, ~1,000,000 OemPart rows, ~45k unique part numbers), then
merge the PR + push.

#### What's NOT needed on resume

- ~~Apply migration~~ — already applied to prod
- ~~Regenerate `wn_parts_export.json`~~ — only matters if SQLite changes
- ~~Re-run PDF seed~~ — already complete (344 machines / 85k parts)
- ~~Re-run prices seed~~ — already complete (200k snapshots)

## 24 June session — inventory analysis + LS Engineers BOMs + coverage doubling

**Headline:** inventory coverage went from **33% → 66.8%** in one session. Three
big finds: corrected `1xxxxxxxxx` SKU taxonomy (it's the WN Group's
post-SAP range for big-equipment + agricultural, NOT just Weidemann/Kramer);
LS Engineers exposes a full BOM-style catalog for the 96-machine big-equipment
gap eParts can't fill; and the eParts catalog has many more machines than our
572-machine enumeration captured.

### Committed today (branch `phase-oem-catalog`, prior to today's work)

| Commit | What |
|---|---|
| `5f132fe` | `.gitignore` for `data/` data + `CLAUDE.md` collaboration rules |
| `9216b0d` | 30 Python scripts under `data/` (analysis + scrapers + seeds) |
| `780a5bb` | `docs/oem/data-sources.md` knowledge base + `data-handover.md` + 4 auto-reports |

### What's pending commit (today's late-session work)

- `prisma/schema.prisma` — adds `OemPart.legacyPartNumber`, `OemPartCompatibility` table,
  `WEIDEMANN_ESERVICE` + `LSENGINEERS` enum values
- `prisma/migrations/20260624200000_oem_compat_legacy_enums/migration.sql` — DDL, applied to prod
- `prisma/seed-oem-listings.ts` (patched) — `BATCH=50` + `TX_TIMEOUT_MS=30000` to fix Prisma
  transaction timeout that killed the first Neyer seed
- `prisma/seed-dhs-fitment.ts` — new seed for DHS Compatibility & Fitment data
- `prisma/seed-lsengineers.ts` — new seed for LS Engineers listings + fitment
- 10 new analysis scripts under `data/`
- `docs/oem/data-sources.md` — updated with corrected taxonomy, LS Engineers retailer entry,
  3-environment / 13-layer architecture targets, dev-DB orphan note

### Pipeline runs that completed today

| Job | What | Output |
|---|---|---|
| **eParts Phase 1-4** | Enumerate + download Parts Manuals (the missing piece from yesterday) | 572 machines confirmed; 2,180 Parts Manual PDFs (7.7 GB) downloaded |
| **PDF bulk extract** | Process new PDFs through dual-layout extractor | 1,848 new extracts; **22 RC-series PDFs that failed yesterday extracted cleanly this run** |
| **PDF bulk ingest → SQLite** | Grow `wn_parts.sqlite` | **2,202 models / 59K assembly groups / 826K parts / 35,627 distinct SKUs** (9.7× yesterday) |
| **OemPart re-seed (prod)** | Refresh Supabase with new PDF data | Multi-hour run; idempotent |
| **DHS fitment scrape** | Extract structured `<table class="fitment-table">` from 24,921 DHS pages | 21,511 with fitment (86%); seeded **24,950 OemPartCompatibility rows** |
| **Neyer 14,644 listings seed** | `OemPartListing` source=neyer-en | 14,644 rows seeded; deep scrape continued in background |
| **LS Engineers sitemap recon** | Fetch `media/sitemap.xml` + 7 sub-sitemaps | 277,334 URLs; 26,186 Wacker; 21,505 part-pages + ~4,680 categories |
| **LS Engineers walk Phase 5a** | Iterative discovery via link-graph (sitemap only covers 4% of diagrams!) | Converged at **10,351 distinct diagram URLs** spanning all WN machine types |
| **LS Engineers walk Phase 5b** | Fetch each diagram page, parse embedded `"items":[...]` JSON | **10,351 diagrams / 191,540 parts / 31,636 distinct SKUs**; 100% field coverage (`ref` callout #, `sku`, `name`, `price_amount`, `image_url`, `lead_time`) |
| **LS Engineers seed (listings + fits)** | After splitting comma-joined `fits_models` strings | **21,501 `OemPartListing` rows** + **60,294 `OemPartCompatibility` rows** |

### Key findings (added this session)

- **`1xxxxxxxxx` taxonomy correction.** Earlier hypothesis "Weidemann/Kramer only"
  was wrong. Verified on WN EZ80 mini-excavator + TH627 telehandler — both use
  `1000xxxxxx` SKUs. **`1xxxxxxxxx` is the WN Group post-SAP numbering for the
  entire big-equipment + agricultural range** (excavators, telehandlers, wheel
  loaders, dumpers, Weidemann, Kramer). KB doc §1 + Handover both updated.
- **DHS reclassified as multi-brand** (not WN construction only). Carries 86,513
  `1xxx` SKUs; covers 84.6% of stocked inventory; single best price source.
- **eParts BOM coverage is sparse for big equipment.** Of our 572 machines,
  only **256 have actual parts data**; 96 big-equipment machines (excavators,
  loaders, telehandlers, dumpers, attachments, skid steers) return empty BOMs
  from the public eParts API. Operating manuals exist but no parts manuals.
- **LS Engineers fills the big-equipment gap.** 21,505 unique SKUs derived from
  sitemap + 10,351 BOM-style diagrams from link-graph crawl. 841 LS-only
  machines (TH-telehandlers, ET-excavators, etc.) that have **no equivalent in
  eParts**. For 376 eParts machines with BOMs, LS overlap is mostly small-machine
  (121 strong matches with Jaccard > 0.3); for big-machines like DPU 100-70,
  eParts goes deeper (645 vs 267 SKUs because it walks sub_revisions like Engine).
- **eParts catalog is larger than our enumeration** found. Live dashboard for
  EZ26-2 (machine `1000462823`) shows ~80+ excavator codes under "Tracked Zero
  Tail Excavators" alone — our enumeration found 0 EZ-series. We missed
  hundreds of machine codes by not following the non-rev navigation path.
- **eParts DOES expose WNC serial-number ranges** via `/navigation/nonRevMachine/{code}`
  endpoint — sparepartsBookList[].name is e.g. `"EZ26-2 (WNCE2401K00000140 - ...)"`.
  This is the natural revision identifier for big-equipment machines.
- **LS Engineers does NOT expose serial-number ranges.** Variants are
  distinguished by URL slug suffixes only (`-1`, `-long`, `-left/right`) — no
  WNC, no AF/AI codes, no revision numbers in description or attributes.
- **Inventory shape (`Inventory DM-WN.xlsx`).** 2,371 stocked SKUs, split:
  1,276 `5xxx` Wacker construction, 1,094 `1xxx` Weidemann/Kramer/big-equipment, 1 legacy.

### Coverage trajectory today

| State | Stocked SKUs covered | % |
|---|---:|---:|
| Session start (eParts + 313 PDFs) | 783 | 33.1% |
| + Legacy↔modern mapping (49,365 pairs) | +30 | 34.3% |
| + Neyer 45K SKUs ingested | +410 | 50.4% |
| + LS Engineers 21,505 SKUs | +388 | **66.8%** |
| Residual gap | 788 | 33.2% |

The residual 788 splits roughly 394 `5xxx` / 394 `1xxx` / 1 legacy.

### Schema migration applied 2026-06-24 ~20:00 UTC (prod only)

Migration `20260624200000_oem_compat_legacy_enums` applied to **prod
(`nxqqmplptalbxmfmbtfs`)** via `mcp__supabase__execute_sql`. Adds:

1. `OemPart.legacyPartNumber String?` + index (backfill from `sku_legacy_modern_map.json`)
2. `OemCatalogSource` enum: + `WEIDEMANN_ESERVICE`, + `LSENGINEERS`
3. New `OemPartCompatibility` table (keyed by `partNumber`, NOT FK to `OemPart` —
   compatibility is a property of the SKU itself, not a catalog row)

Dev `iuimkzettrrqvvvgfvqp` is **paused + lives under a different Supabase account**
(prod token can't see it). Migration **not applied to dev**. See
[`oem/data-sources.md`](oem/data-sources.md) §9 for the dev-DB orphan question.

### Background jobs still running at session end

| Job | Status |
|---|---|
| `bm52g0yih` Neyer deep scrape | ~30% done last check; will run overnight, hits ~45,584 SKUs total |
| `bpzt7jipp` OemPart re-seed (eParts+PDFs) | Multi-hour Supabase upsert run; safe to leave |

### Tomorrow's queue (in priority order)

1. **Re-enumerate eParts properly.** Yesterday's 572-machine walk missed huge
   swaths — EZ-series, Z3-series, TH-series, and many non-rev machine codes. The
   `/navigation/nonRevMachine/{code}` + `sparepartsBookList[].name` endpoints
   give us the WNC serial range per machine. Expected real count: 1,500-2,500
   machines (vs 572 captured). Need to walk every category leaf, then for each
   product hit `nonRevMachine` to get the spareparts-book list.
2. **Deep-dig LS Engineers for hidden serial-range info.** I only checked the
   model page — part-detail pages, assembly descriptions, JSON-LD blocks, hidden
   meta tags may have it. Tabled at end of session (interrupted by re-fetch
   cross-origin error).
3. **Build the extended LS-only-machines seed.** Plan committed in `oem/data-sources.md`:
   - For the **841 LS-only machines** → seed full `OemMachine/Revision/Component/Part`
     hierarchy with `source=LSENGINEERS`
   - For the **143 LS machines overlapping eParts** → don't duplicate BOM, just
     enrich via `OemPartListing` (already seeded) + `OemPartCompatibility` (seeded)
   - Use eParts machine code + WNC serial range from the re-enumeration above
     to enrich LS-derived machines (model name as join key)
4. **Top-up Neyer seed** when deep scrape finishes (currently at 14,644 of 45,584).
   Just re-run `prisma/seed-oem-listings.ts` — idempotent.
5. **Process the new Parts Manual PDFs through extractor** then re-seed OemPart
   (this is the second pass — first one is still running tonight).
6. **Re-measure inventory coverage** after all the above lands. Target: ~75-80%.
7. **Architecture target** (`docs/oem/data-sources.md` §9): set up real dev/staging
   environments, CI/CD pipeline, RLS policies, Sentry. None of layers 4-13 of
   the production stack are in place yet.

### Files committed at end of 24 June (covering today's work)

| Commit | What |
|---|---|
| `5f132fe` | `.gitignore` + CLAUDE.md collaboration rules |
| `9216b0d` | 30 Python scripts (analysis + scrapers) |
| `780a5bb` | `docs/oem/data-sources.md` KB + Handover update + auto-reports |
| (next commit, end of 24 June) | schema migration + new seeds + late-session scripts + this handoff update |

## This session's deltas (skim before starting work)

Seven small follow-ons landed:

| Commit | What |
|---|---|
| `1255f75` | Customer-facing product gallery (hero + thumbnails) + tags exposed as `<meta keywords>` + JSON-LD Product schema on PDP. `mainImage` moved out of admin-only fieldset into a public "Bilder" group. |
| `ace9276` | `Privat | Bedrift` segmented toggle in the TopBar — only for anonymous guests. Pure cookie flip via existing `setCustomerTypeAction` (no BRREG lookup). Hidden for authenticated users. Reload after flip so server-rendered prices refresh. |
| `292dd21` | Admin overview: new `Bruttofortjeneste (estimat)` row beneath Omsetning showing margin in kr + % per period (I dag / Denne uka / Denne mnd). Footnote when not 100 % of items have `purchasePrice`. Existing Omsetning flipped from `totalPrice` (incl. MVA) to `subtotalExclMva` (ex-MVA) — the old label was technically misleading in Norwegian accounting terms. |
| `bc05e8f` | Lint cleanup. 11 in-app `<a href>` migrations to `next/link` (CookieConsentBanner, LoginForm, RegisterForm, ForgotPasswordForm, info/deletyper, produkter/[sku] breadcrumb, admin overview "Se alle" links, admin produktforslag back-link, _NyttProduktForm). One `/api/exports/low-stock` `<a>` kept with eslint-disable + explainer (file download, not page nav). Plus `eslint --fix` autofix pass. Lint problem count 273 → 155. |
| `a408c21` | **Chrome refresh.** Red Dyvikamaskin logo (321×98 PNG, displayed at 118×36 via `next/image` with `loading="eager"` + `fetchPriority="high"`) replaces the text wordmark in TopBar. VELG LAGER button dropped from PrimaryNav. Three logo files committed to `public/brand/`. Locked-in product decision: chrome stays two-row white, no dark utility bar. |
| `f1eb858` | **Manual backup trigger.** New "Kjør sikkerhetskopi nå" button on `/admin/backup/setup` enqueues a one-off `daily-backup` job to the maintenance queue — same code path as the 02:00 UTC cron. Polls every 2 s for the resulting `BackupRun` row and surfaces SUCCESS / SKIPPED / FAILED with size + duration + storage path. Verified end-to-end (68 KB, 2 s, real artifact in Supabase Storage). |
| `d73171c` | **Admin sidebar discoverability.** Added "🔐 Sikkerhetskopi" link to the admin sidebar's `NAV_LINKS` array, slotted between Butikkinnstillinger and the Rapporter & eksport section. Page is still SUPER_ADMIN-gated — a STORE_MANAGER clicking the link will be redirected to `/login`. Role-aware sidebar filtering is parked as a follow-up. |

## Operational status (verified 11 May 2026)

- **Daily backup pipeline: fully alive.** SUPER_ADMIN
  `dyvikamaskin@bojoind.com` enrolled an age key pair on 11 May 08:24
  UTC. A manual verification run at 12:27 UTC produced a 68 KB
  `SUCCESS` artifact at `2026/05/11/industriparts-…sql.age` in
  Supabase Storage in ~2 seconds. Next scheduled run tomorrow at
  02:00 UTC should land green automatically. (The 02:00 UTC run this
  morning returned SKIPPED because the key wasn't enrolled yet —
  that's the BackupRun row sitting below the SUCCESS one.)

  Manual trigger lives at `/admin/backup/setup` →
  "Verifiser sikkerhetskopi" → "Kjør sikkerhetskopi nå". Same code
  path as the cron — useful whenever a key is rotated or the pipeline
  needs a sanity check.

- **Railway curl cron retirement: hold for now.** The `maintenance`
  BullMQ queue worker boots cleanly on every deploy (we see
  `[queue] workers started: notifications, enrichment, maintenance` in
  startup logs), but the Railway CLI scopes `railway logs --since 24h`
  to the current deployment only — we can't yet confirm 24 hours of
  `[maintenance] expired reservations` ticks across deployments from a
  terminal. Check the **Railway dashboard logs** (which span
  deployments) for that line before deleting the curl service. The
  `curl-cron` service is harmless to keep running in the meantime.

- **Vipps redirect URLs** are constructed dynamically — there is no
  `VIPPS_REDIRECT_URI` env var on Railway. The route-group rename in
  PR 1 of the v4.2 queue cannot break the Vipps flow because of this.
  (Recorded in `v4.2-redesign-plan.md` §PR 1 Risks.)

- **Logo dimensions for PR 1** of the v4.2 queue: `dyvika-logo-red.png`
  is 321 × 98 px. At display height 36 px → width 118 px. Recorded in
  `v4.2-redesign-plan.md` §PR 1 step 1.

## Outstanding work queue

### v4.2 — storefront redesign (decisions locked, unchanged from 11 May)

| Order | Branch | Scope | Reference |
|---|---|---|---|
| 1 | `phase-globalize-topbar` | Route group `(store)` → `(customer)`, 6 folder moves into it, EntryModal mount shift, cached drawer fetchers. **No chrome work — already shipped (`a408c21`).** | `v4.2-redesign-plan.md` §PR 1 |
| 2 | `phase-desktop-drawer` | Cascading multi-pane drawer on `≥md`, mobile keeps stack/push | `v4.2-redesign-plan.md` §PR 2 |
| 3 | `phase-design-homepage` | Tokens, marketing components for homepage **body only** (chrome unchanged), Kampanjer + Outlet placeholders | `v4.2-redesign-plan.md` §PR 3 |

Total estimated time: ~6 h 45 min. Each PR is independent — stop after
any of them and ship.

### OEM Parts — see [`docs/oem/PLAN.md`](oem/PLAN.md) (canonical)

The OEM-catalog work is now its own sub-project under `prisma/oem/`,
`scripts/oem-*`, `src/lib/oem-db.ts`, `data/`, `docs/oem/`. The full
phase-by-phase plan with current status lives in **[`docs/oem/PLAN.md`](oem/PLAN.md)** —
**read that file for any OEM-catalog work**, including:

- Phase 1: complete tier-1 (eParts) BOM ingest for all 4,338 machines (current: 572 walked)
- Phase 2: tier-2 (LS Engineers) BOM fill for big-equipment gaps
- Phase 3: tier-3 (Neyer + DHS) enrichment + stub Parts
- Phase 4: retailer pricing top-up (tmsequip past 10K, 8 backlog retailers)
- Phase 5: Supabase Storage upload (diagrams + PDFs)
- Phase 6: completeness (22 failed PDFs, sub-machine modelling, hand-verify)
- Phase 7: drop OEM tables from Dyvika prod (frees ~700 MB)
- Phase 8: storefront integration (`oemPrisma` callsites, search, viewer)
- Phase 9: production hardening (RLS, FTS, backups, monitoring)
- Phase 10: ongoing maintenance (re-walks, snapshot refresh)

Do NOT add new OEM TODOs to this handoff file — edit PLAN.md directly.
The legacy [`v4.3-oem-catalog-plan.md`](v4.3-oem-catalog-plan.md) is
superseded by PLAN.md (kept for reference of the storefront-features
plan).

## Earlier session's deltas (for context)

Five focused follow-ups landed on top of the Phases 0–5+4.5 base
during the previous session (10 May 2026):

| Commit | What |
|---|---|
| `c9e6b9c` | `VIPPS_DISABLE_CAPTURE` kill-switch · Sentry pipe for terminal job failures · search autocomplete dropdown |
| `0ac27b0` | New `maintenance` BullMQ queue; `expire-reservations` runs every minute via `upsertJobScheduler`. Retires the Railway curl cron once verified. |
| `2a04cf1` | Daily backup at 02:00 UTC → Supabase Storage. New `BackupRun` model. `BackupWidget` rewritten to read from BackupRun (not Profile.lastBackupAt). |

There are now **two backup paths** running in parallel — see the
"Backup architecture" section below.

For deep context read these in order:
1. **This file** — current state, decisions, what's next.
2. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) — master plan, phase definitions, decisions register, risk register.
3. [`route-stub-registry.md`](route-stub-registry.md) — every route referenced from the new chrome that does not yet have a page.
4. [`restore-runbook.md`](restore-runbook.md) — how to decrypt + restore an age-encrypted backup.
5. [`industriparts-spec-v4.docx`](industriparts-spec-v4.docx) — system specification (v4.1).

## Where the code is

`main` HEAD: `d73171c chore(admin-nav): link /admin/backup/setup from the sidebar`.
Production Railway tracks `main` and is live with everything below.
Last deploy: `e548598e` SUCCESS at 11 May 14:32 +02:00.

Recent commits on `main` (newest first):

```
d73171c chore(admin-nav): link /admin/backup/setup from the sidebar
6d5a2aa docs: handoff — backup pipeline verified end-to-end
f1eb858 feat(backup): "Kjør sikkerhetskopi nå" trigger on /admin/backup/setup
36be766 docs: shrink v4.2 plan after early chrome refresh (a408c21)
a408c21 feat(chrome): red logo in TopBar + drop VELG LAGER from PrimaryNav
6d3d3c7 docs: pin logo dims, record VIPPS verification, backup + cron status
bc05e8f chore(lint): a-href → Link migration + autofix sweep
70e10b1 docs: refresh handoff + add v4.2 storefront redesign plan
292dd21 feat(admin-overview): gross margin tiles + flip Omsetning to ex-MVA
ace9276 feat(customer-type): Privat | Bedrift toggle in TopBar for guests
1255f75 feat(product-visibility): customer gallery + SEO-only tags
db5beb6 feat(follow-ups): finish open phase 7/8/9 items
e9b236f feat(phase-9): GDPR -- cookie banner + privacy + data rights + consent gate
a0c06ae feat(phase-8): B2B richness -- per-customer pricing + backorder + supplier + marketing consent
5e73bea feat(phase-7): returns + quotes + SAF-T 1.10 + a11y scaffolding
a187a1a feat(admin-metadata): purchasePrice + tags + hiddenDescription + image upload
19010d6 feat(phase-6): hardening -- RLS + rate limits + CSP + opt-in MFA
2a04cf1 feat(daily-backup): automatic age-encrypted backup at 02:00 UTC to Supabase Storage
0ac27b0 feat(maintenance-queue): BullMQ-cron migration -- expire-reservations every minute
c9e6b9c chore(follow-ups): VIPPS_DISABLE_CAPTURE + Sentry job alerts + search autocomplete
d468bf1 feat(phase-4.5): local-disk backup MVP -- age-encrypted SQL dump
1412867 fix(proxy): exclude /api from next-intl matcher
b84a79e feat(phase-5): pg_trgm + FTS search -- three-stage relevance cascade
```

Phase branches remain on origin as historical references. Phases 6-9
plus the recent follow-ons landed directly on `main` since each was a
self-contained PR rather than a multi-week phase.

GitHub Flow: feature branches off `main`, fast-forward merge back.
Standard gates per PR: `npm run typecheck && npm test && npm run build && npm run audit:links`.

## Phase status

| Phase | State | Notes |
|---|---|---|
| 0 Triage | ✅ Live | Logout via Server Action; `/konto` page; static link-audit script |
| 0.5 Storefront chrome | ✅ Live | TopBar, PrimaryNav, CategoryDrawer (multi-pane drilldown), InfoCardsRow |
| 0.6 Dynamic categories | ✅ Live | `findOrCreateCategoryByPath`, CategoryPicker combobox, `/admin/kategorier` |
| 0.7 Condition / provenance / filters / My Machines | ✅ Live | Schema + admin form + filter bar + `/info/deletyper` + `/konto/mine-maskiner` + PDP badges |
| 1 Foundations | ✅ Live | Vitest, Playwright, CI workflow, WebhookEvent |
| 2 Money correctness (Decimal) | ✅ Live | `Money` brand on `decimal.js`; pricing rejects raw `number`; cart strings across the wire; Vipps webhook + MVA tax CSV use Decimal sums. **Note:** `decimal.js` imported direct, not via `Prisma.Decimal` — see "Build gotcha" below. |
| 3 Vipps capture-on-dispatch + Stock reservations | ✅ Live | §38 compliance gap closed. `StockReservation` table; race fence at checkout. Webhook split (handleAuthorized/handleCaptured/handleVoided). `captureSaleOnDispatch` is the dispatch entry point, wired into both admin "Mark shipped" and the MyBring label route. |
| 4 Job queue (BullMQ) v1 | ✅ Live | Co-host model. `notifications` + `enrichment` + `maintenance` queues. Workers boot via `src/instrumentation.ts`. Sentry pipe wires terminal failures to alerts (`reportJobFailure`). **Requires `REDIS_URL`** — set on Railway + local `.env`. |
| 4.5 Backup (local + automatic) | ✅ Live | Two paths in parallel — see "Backup architecture" below. Manual MVP streams to browser; automatic daily job uploads age-encrypted artifact to Supabase Storage. `BackupRun` audit table tracks every run. |
| 5 Search (pg_trgm + FTS) | ✅ Live | `Product.searchKey` + `Product.searchVector` columns + trigger; three-stage cascade (exact → trigram → FTS) in `src/services/catalog/search.ts`. Storefront autocomplete dropdown wired to `/api/search`. |
| 6 Hardening (CSP / MFA / RLS) | ✅ Live | Two-phase opt-in MFA (env-gated). RLS on customer-data tables. Login + checkout rate limits via Upstash. CSP Report-Only first, then enforce. |
| 7 Returns + Quotes + A11y + SAF-T | ✅ Live | Forbrukerkjøpsloven returns flow with Vipps refund; B2B RFQ → convertToOrder; SAF-T 1.10 XML export; a11y scaffolding (axe-core in CI). |
| 8 B2B richness | ✅ Live | Per-customer `CustomerPriceList`; backorder workflow on SaleItem; Supplier model + admin UI; marketing consent gate on email service. |
| 9 GDPR | ✅ Live | Cookie banner (3 categories, granular); /personvern + /vilkar pages; Art. 20 export (`gdpr.ts`); Art. 17 anonymise; marketing consent. |
| **Follow-ons** | ✅ Live | admin-metadata (purchasePrice + tags + hiddenDescription + image upload); product-visibility (gallery + SEO tags + JSON-LD); customer-type toggle in TopBar; gross-margin tiles on /admin. |
| v4.2 Storefront redesign | ⏳ Queued | Three PRs in `v4.2-redesign-plan.md`. ~7h. |
| v4.3 OEM catalog (data plumbing) | 🌓 Branched, awaiting DB | `phase-oem-catalog @ 80a33e4`. Schema + migration + three seeds committed. ~30 min to apply once a Supabase project is awake. See 23 June session above. |
| v4.3 OEM catalog (storefront features) | ⏳ Queued, plan written | Full plan in `v4.3-oem-catalog-plan.md` — 4 PRs (~10h30 total). Two of them filed as task chips: `task_1b6fddc8` (OEM-number search), `task_ef6deb8e` (interactive parts viewer). |

## Verified locally as of last commit

- `npm test` — **80/80** passing across 10 test files (kid, brreg, slugify, pricing, reservations, notifications-dispatch, enrichment-dispatch, maintenance-dispatch (incl. daily-backup), search, age round-trip)
- `npm run typecheck` — clean (zero errors)
- `npm run audit:links` — **42 pages, 21 APIs, 0 broken**, 2 known stub references (`/kampanjer`, `/info/finn-lager`)
- Production smoke tests (HTTP):
  - `/`, `/produkter`, `/info/deletyper` → 200
  - `/api/search?q=ab` → 200 with JSON
  - `/admin/backup/setup` → 307 redirect to `/login?next=…`
  - `/api/admin/backup/download` → 401 `{"error":"Unauthorized"}`

## Production DB state

All migrations through Phase 5 + 4.5 are applied. Sequence:

```
20260507154237_phase8_invoice_counter
…
20260509000000_phase15_webhook_event              (Phase 1)
20260510120000_phase07_condition_provenance_savedmachine  (Phase 0.7)
20260510140000_phase3_vipps_capture_stock_reservations    (Phase 3)
20260510200000_phase5_search_pgtrgm_fts                  (Phase 5)
20260510210000_phase45_backup_mvp                        (Phase 4.5)
20260510220000_phase45_backup_run                        (Phase 4.5 follow-up — daily backup)
```

Verify any time:

```sql
SELECT migration_name, finished_at FROM _prisma_migrations
ORDER BY started_at DESC LIMIT 5;
```

Catalog scaffolding present (17 categories, 15 makes, 265 models, 1
profile, 1 store) but **0 products, 0 sales, 0 sale items.** Production
is fully wired and ready for first product import.

## Env vars added across the v4.1 work

```
# Phase 4 — BullMQ requires raw Redis protocol (TCP+TLS), separate from
# the existing Upstash REST creds. The token is the same secret; only
# the URL form differs (rediss://default:<token>@host:6379).
REDIS_URL=rediss://default:gQAAAAAAAamjAAIgcDI2ZDE4ZjUxZmFjY...@driven-gull-108963.upstash.io:6379

# Phase 4 — Cron sweep auth for /api/jobs/expire-reservations.
# Now used only for the manual escape hatch (the BullMQ-cron migration
# made the curl-cron service redundant for scheduling — see operational
# follow-up below).
CRON_SECRET=<set on Railway>

# Daily-backup follow-up: existing service-role key, used by the new
# src/lib/supabase/admin.ts to upload encrypted artifacts to the
# Storage bucket. Was already set for other reasons; no change needed.
SUPABASE_SERVICE_ROLE_KEY=<set on Railway>

# Phase 4 follow-up — kill-switch for the Vipps capture-on-dispatch
# path. Set to "1" or "true" to skip Vipps capture during an outage.
# Default (unset / "0") is normal capture-on-dispatch behavior.
# NOT currently set anywhere — flip on Railway only during a Vipps
# outage. Read at call time; no redeploy required.
VIPPS_DISABLE_CAPTURE=
```

All set on Railway production env (except `VIPPS_DISABLE_CAPTURE`,
which exists only as a code path; flip it on when needed). Local
`.env` mirrors them for dev. **Note:** when `REDIS_URL` is missing the
queue subsystem warns loudly at boot and `enqueueNotification` /
`enqueueEnrichment` calls throw — that loud failure is intentional,
not a bug.

## Build gotcha — decimal.js, not Prisma.Decimal, in shared modules

**Anything imported by a `"use client"` component (or transitively from
one) MUST NOT import `@/app/generated/prisma/client`.** The Prisma 7
client export pulls server-only Node modules (`node:module`,
`node:path`, `node:url`) that Turbopack rejects in client bundles. The
dev server's looser chunking misses it; production builds fail.

Discovered while merging Phase 0–4 into main: the deploy failed because
`formatters.ts` and `CartContent.tsx` had `import { Prisma } from
"@/app/generated/prisma/client"`. Fix: use `import Decimal from
"decimal.js"` directly. Prisma.Decimal IS decimal.js (Prisma vendors it
inside its runtime), so behavior is identical — just packaged through a
path that doesn't drag Node modules into client bundles.

Server-only modules (`pricing.ts`, `cart.ts`, server actions, API
routes) can keep using `Prisma.Decimal` — Prisma's runtime never reaches
the client bundle from those.

## Backup architecture — two paths in parallel

Both paths produce the same `.sql.age` artifact (age-encrypted Postgres
INSERT dump). Decrypt procedure is identical (`docs/restore-runbook.md`):
both need the offline private key that was downloaded once during
`/admin/backup/setup`.

| Path | Trigger | Destination | Source of truth |
|---|---|---|---|
| **Manual** (`/api/admin/backup/download`) | SUPER_ADMIN clicks "Last ned" on `/admin` | Browser download → admin's laptop | Bumps `Profile.lastBackupAt` |
| **Automatic** (`maintenance` queue `daily-backup` job) | `0 2 * * *` cron via `upsertJobScheduler` | Supabase Storage bucket `backups` at `YYYY/MM/DD/industriparts-{ISO}.sql.age` | New `BackupRun` row per attempt |

The two are independent — disabling one doesn't break the other. The
manual path is recommended weekly for "offsite" copies (Supabase = same
vendor as the live DB, so Supabase-wide outage takes both copies down
simultaneously).

**Recipient selection (automatic):** the oldest SUPER_ADMIN with a
`backupPublicKey` is the deterministic recipient. If none, the job
records `BackupRunStatus.SKIPPED` and emits a warning — no exception.
Multi-recipient encryption (so any admin can decrypt) stays an open
follow-up; today's `lib/backup/age.ts` already supports it via
`addRecipient`, but the scheduled job uses a single recipient.

**Retention:** 30 days. After each successful run, `BackupRun` rows older
than 30 days are pruned and the matching Storage artifacts deleted.
Prune failures are non-fatal.

**Bucket setup:** `backups` is auto-created on first run (idempotent
`createBucket` call swallows the "already exists" error). No manual
Supabase config required.

**BackupWidget on `/admin`** reads from the latest `BackupRun(status=SUCCESS)`,
not `Profile.lastBackupAt`. The latter ticks on *both* manual downloads
and automatic runs, so it can lie about automatic backups working when
only manual downloads have happened recently. Staleness threshold is
2 days (was 7) since automatic backups should run daily.

## Latent bug also fixed mid-session — proxy.ts /api/* 404

`src/proxy.ts` matcher was `/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)` —
applied next-intl middleware to **every** non-asset path including
`/api/*`. next-intl can't route API paths and silently 404s them.
Fixed by prepending `api|` to the lookahead. **The Vipps webhook was
silently broken** since the very first deploy; never surfaced because
no real Vipps traffic landed.

## Decisions resolved this session — do not re-litigate

- **B2B payment paths:** Vipps **or** invoice today. Bank transfer + credit card are future expansion. Phase 3 doesn't special-case them.
- **Phase 2 historical-data policy:** moot — 0 sales when refactor landed. Pure pre-launch refactor.
- **Phase 3 grandfathering:** skipped — 0 in-flight AUTHORIZED orders to migrate. Capture-on-dispatch is the only behavior from day one.
- **Phase 3 feature flag:** plan's `VIPPS_CAPTURE_ON_DISPATCH` soak-window flag dropped (no live traffic to soak against). Replaced by the `VIPPS_DISABLE_CAPTURE` kill-switch — shipped this session. When set to `"1"` or `"true"`, `captureSaleOnDispatch` skips the Vipps capture API call but still decrements stock and releases reservations. Sale stays AUTHORIZED; admin reconciles capture via the Vipps portal post-outage. Env var is read at call time, so toggling on Railway takes effect on the next dispatch without redeploy.
- **Decimal library:** use Prisma 7's bundled `decimal.js` directly instead of the plan's `decimal.js-light` (avoids dual-library bundle, matches what Prisma uses internally). On the client side, install `decimal.js` directly per the build-gotcha note above.
- **Phase 4 worker hosting:** option A (co-host in main process) per the cost/operational tradeoff for current load. Migrate to a separate Railway service (option B) only on memory pressure or HTTP-latency regression — same codebase, just a different launcher.
- **CSV `categoryPath` separator:** `/`.
- **CSV `provenance` column:** required on every row, no default (Forbrukerkjøpsloven / Markedsføringsloven safety).
- **Manual new-product `provenance` default:** AFTERMARKET (lowest claim).
- **Provenance terms (Norwegian):** Originaldeler / OEM-deler / Uoriginale deler / Aftermarket. Help page at `/info/deletyper`. Wording uses "fabrikken" not "maskinprodusenten".
- **Condition rating labels:** descriptive (Som ny / Utmerket / God / Akseptabel / Slitt), 5-dot scale on PDP.
- **Saved machine cap per profile:** 20.
- **Filter persistence:** URL only (saved machines are the persistent equivalent).
- **Slugify rules:** Norwegian-friendly (`æ→ae`, `ø→o`, `å→a` plus Swedish/German diacritics). 10 unit tests cover edge cases.
- **Hamburger drawer is the canonical category nav.** No permanent left sidebar on storefront pages. Reference design: tools.no.
- **Test framework:** Vitest 3.2.4. Coverage via `@vitest/coverage-v8`.
- **Search trigram threshold:** 0.4. Three-stage cascade priority is exact > trigram > FTS.

## Decisions still pending — need user sign-off before code

1. **Phase 6 — MFA grace period for existing admins.** Default 7 days. Default also applies the day Phase 6 ships, not retroactively from account creation.

(Most other plan decisions are now resolved as Phases 2/3/4/4.5/5 shipped. The MFA grace period is the only outstanding one.)

## Open follow-ups

Real work items that didn't make it into the phase that introduced
them. Loose-coupled — pick any in any order. Shipped follow-ups are
listed in the next section for posterity.

### OEM Parts follow-ups → see [`docs/oem/PLAN.md`](oem/PLAN.md)

All OEM-catalog follow-ups (BOM walks, PDF recovery, retailer scrapes,
storefront integration, etc.) have moved into the OEM master plan with
specific phase references. The 25 June split-out section above
summarises today's structural change; PLAN.md tracks all status going
forward.

### Phase 4 follow-ups (open)

- **PDF queue split.** Invoice PDF rendering currently runs inside the `notifications:invoice-issued` job handler. Splitting it out lets us cap concurrency separately and add a polling endpoint for "is the invoice PDF ready yet?" UX. ~half day.
- **Invoice 202 + polling.** Plan calls for the invoice route to return 202 immediately and expose a status-poll endpoint. Today it's synchronous; deferred until the PDF queue above is in place.

### Phase 4.5 follow-ups (open)

- **`/admin/sikkerhetskopier`** admin page listing past `BackupRun` rows. Schema exists; UI not built yet. Read `BackupRun` ordered by `startedAt DESC` and render status + size + storagePath as a download link (need a signed-URL endpoint for that — Storage bucket is private). ~half day.
- **Multi-recipient age encryption** when there are multiple SUPER_ADMINs (so any of them can decrypt). Today's scheduled backup encrypts to one recipient — the oldest SUPER_ADMIN with a key. `encryptStream` in `lib/backup/age.ts` already supports `addRecipient`; the call site change is small once needed. ~1 hour.
- **Email alert on stale or failed backups.** `BackupWidget` shows the dashboard banner already, but a Resend email would page someone who isn't watching the dashboard. Hook it into the `daily-backup` handler when it records SKIPPED/FAILED, plus a separate "no SUCCESS in N days" check. ~half day.
- **Offsite backup destination** (optional, defence in depth). Today the automatic copy lands in Supabase Storage — same vendor as the live DB. A weekly push to S3 / Backblaze in a different account would survive a Supabase-wide incident. Same `runScheduledBackup` pipeline, just an additional upload target. ~1 day if scope creeps; ~half day if pragmatic.

### Phase 5 follow-ups (open)

- **Search-result highlighting.** Bold matched tokens in the autocomplete dropdown + on the results page. ~1 hour.
- **Trigram threshold tuning.** 0.4 is the current default; observe real query patterns once products land and adjust.

### Phase 3 follow-ups (open)

- **Refund flow.** Vipps `REFUNDED` webhook is currently logged-only; no Sale lifecycle update, no admin "Refund" UI. When refunds become operationally relevant, add `handleRefund` in the webhook + an admin action that calls `refundVippsPayment` and marks `Sale.status = REFUNDED`. ~half day.
- **Parallel-checkout integration test.** Plan calls for "50 parallel checkouts on the last unit, zero overcommits." Needs real-DB infra (testcontainers or a Supabase preview branch). Deferred until that infra exists.

### Phase 2 polish (open)

- **9 remaining display-side `.toNumber()` sites** in admin pages (`/admin/page.tsx`, `/admin/regnskap/page.tsx`, `/admin/mva-rapport/page.tsx`), `/betaling/bekreftelse`, `invoice-pdf.tsx`, `notification-service.ts`. None affect money correctness — formatters now accept Decimal so the redundant `.toNumber()` calls can be dropped. ~1 hour.

### Pre-Phase-5 small items (open)

- **Edit-product editable form** at `/admin/produkter/[sku]/rediger` — read-only display today; CategoryPicker + condition/provenance + provenance fields need wiring.
- **Drag-to-reorder** in `/admin/kategorier`. Server action `reorderCategoriesAction` exists; UI is static order.
- **Brand chip-row tidy-up** on `/produkter` — text `brand` field still rendered separately from the Phase 0.7 `MachineMake` filter chips.

### Operational items (manual, no code)

- **Retire the Railway `curl` cron service.** The BullMQ `maintenance` queue now schedules `expire-reservations` every minute (verified in CI; pending verification in production logs). Once Railway logs show `[maintenance] expired reservations` ticks consistently for ~24 hours, delete the `curl` cron service from the Railway project. `/api/jobs/expire-reservations` stays as a manual escape hatch; `CRON_SECRET` stays needed for it.
- **Verify the daily backup runs at 02:00 UTC.** First run will be the morning after deploy. Expected outcomes: `SUCCESS` row in `BackupRun` if a SUPER_ADMIN has registered an age public key via `/admin/backup/setup`; otherwise `SKIPPED`. Check `/admin` dashboard — `BackupWidget` should reflect "Siste automatiske kjøring: for 0 dager siden (X KB)".
- **Pull a manual backup every now and then.** Click "Last ned sikkerhetskopi" on `/admin` weekly and stash the resulting `.sql.age` file somewhere durable (external drive, cloud sync, etc.). The Supabase Storage copy is automatic but co-located with the live DB; a manual local copy is your true offsite backup.

## Shipped follow-ups (for posterity)

For context on what's already been done if you're re-reading old plan
sections that referenced "todo: …":

- ✅ **BullMQ-cron migration** — `maintenance` queue + `expire-reservations-cron`. (`0ac27b0`)
- ✅ **Sentry alert wiring for failed BullMQ jobs** — `src/lib/sentry.ts` + worker `failed` handlers. (`c9e6b9c`)
- ✅ **`VIPPS_DISABLE_CAPTURE` kill-switch** — env var inside `captureSaleOnDispatch`. (`c9e6b9c`)
- ✅ **Daily-backup at 02:00 UTC → Supabase Storage** — `runScheduledBackup` + `BackupRun` model + retention. (`2a04cf1`)
- ✅ **`BackupRun` model** — audit trail for every scheduled and manual backup. (`2a04cf1`)
- ✅ **BackupWidget rewritten** to read latest `BackupRun(SUCCESS)` instead of `Profile.lastBackupAt`. (`2a04cf1`)
- ✅ **Storefront autocomplete dropdown** — `SearchBar` debounced fetch to `/api/search` + keyboard nav. (`c9e6b9c`)

## Infra state

- **Repo:** GitHub `Dyvikamaskin/Dyvikamaskin-Webshop`. `gh` CLI authenticated as VenturaAI1.
- **Supabase project:** `nxqqmplptalbxmfmbtfs` (Dyvikamaskin Webshop, EU West, ACTIVE_HEALTHY). Modern secret key was rotated 10 May 2026 — `rotation_2026_05` (id `1d5b66a5…`); old `default` deleted. Railway env `SUPABASE_SERVICE_ROLE_KEY` holds the new value.
- **Supabase Storage:** bucket `backups` is auto-created on the first daily-backup run (private, idempotent `createBucket`). Currently empty until the first 02:00 UTC tick executes successfully.
- **Railway:** Project `dyvikamaskin-webshop` (id `3876e777-…`). One service `Dyvikamaskin-Webshop` plus a `curl` cron service (the curl-cron is now **redundant** — BullMQ schedules expire-reservations directly; delete after verifying production logs show the BullMQ ticks; see operational follow-ups). Single environment `production`. PR Environments not enabled (paid feature). `railway` CLI authenticated as `admindyvikamaskin@bojoind.com`.
- **Supabase Branching:** Persistent staging branches require Pro plan ($25/mo). Free tier offers per-PR preview branches only via the paid GitHub Integration. Decision: defer Supabase staging until Phase 6 needs it for safe RLS testing.
- **Sentry:** wired (org `dyvika-maskin`, project `javascript-nextjs`). DSN in env vars.
- **Upstash Redis:** wired and active. Used by rate limiter via REST creds; BullMQ uses TCP via `REDIS_URL`. Same database, different protocol.

## Permissions / Claude Code setup

- `.claude/settings.json` allowlist: routine browser MCP tools + `Bash(git*)`, `Bash(node*)`, `Bash(npm*)`, `Bash(npx*)`, `Bash(tsx*)`, `Bash(prisma*)`, `PowerShell(*)`. No per-call prompts for these.
- The Chrome in Claude side panel has its own permission system separate from Claude Code's. Persistent allowlist in the extension's LevelDB includes `*.railway.com`, `*.supabase.com`, `*.github.com`, `*.supabase.co`, `*.up.railway.app`. Per-turn whitelist set by Claude Code's MCP host overrides this for navigations driven from this code session — known limitation.
- MCP servers available mid-session that bypass the per-turn whitelist: `fetch` (HTTP), `puppeteer`, `chrome-devtools-mcp`, `supabase` (full management API minus key rotation). Use these for any browser-side work that the Chrome bridge blocks.

## How to continue

**Option A — same machine, same Anthropic account, this Claude Code window already open:**
Just keep typing. Full context is already loaded.

**Option B — fresh Claude session (new Anthropic account, or new chat):**
```
cd "C:\Users\Ventura AI\Documents\industriparts"
```
Then either continue in Claude Desktop, or open a fresh Claude Code session and tell it:
> Read docs/handoff.md and docs/v4.1-implementation-plan.md, then we continue from where we left off.

The project memory file at `~/.claude/projects/C--Users-Ventura-AI/memory/project_industriparts.md` has been updated with current phase progress, so any new Claude Code session in this repo automatically loads phase awareness. (Note: project memory is per-Anthropic-account; a different account starts fresh and must read the docs directly.)

## What to start on next

In recommended order:

1. **Resume the paused eParts seed** (23 June pause point). Migration
   already applied; PDF + prices seeds done; 244/572 eParts machines
   already in DB. Just run `npx tsx prisma/seed-oem-eparts.ts` — the
   fast-path skip handles resume cleanly. ~60-90 min remaining. See
   "OEM-catalog ingest — paused mid-flight" above.
2. **Start v4.2 PR 1 — `phase-globalize-topbar`.** Decisions locked, no
   chrome work needed (logo already shipped). Folder moves + caching.
   ~1 hour.
3. **Verify the daily backup actually ran recently.** Check `/admin` —
   `BackupWidget` should say "Siste automatiske kjøring: for 0 dager
   siden (X KB)". If `SKIPPED`, the operator hasn't completed
   `/admin/backup/setup`; do that.
4. **Retire the Railway curl cron service.** Wait until production logs
   show `[maintenance] expired reservations` ticks for ~24 hours, then
   delete the curl service. Operational hygiene; no code work.
5. **Add a real product** (manual create or CSV import) and walk a full
   money flow end-to-end: cart → checkout → reserve → AUTHORIZED →
   mark shipped → CAPTURED → invoice. With 0 sales today, none of the
   new payment-path code has been exercised against live data.

Or, if you want to push features rather than infra: **content +
product import.** The catalog scaffolding (categories, machine
fitments, OEM catalog after #1) is in place; loading actual products
is what unlocks the storefront for real customers.

**Smaller items if you have an hour:** any of the open follow-ups
above. The v4.3 sub-items in particular are mostly an hour or less
each (re-run tmsequip past the cap, hand-verify a sample,
backfill 222 empty machines).
