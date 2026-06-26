# OEM Parts — sub-project entry point

Reference catalog of Wacker Neuson machine parts: machines, revisions,
assembly diagrams, BOM line items, retailer listings, and price snapshots.

Lives in its **own Supabase project** (`rtzcrngduscrhgozrojv`, under the
BojoIndAI1 org — separate from Dyvika's storefront DB) and is read from
the storefront via a second Prisma client.

## Where to start

1. **[PLAN.md](PLAN.md)** — phase-by-phase master plan with status. This
   is the canonical "what's done / what's next" doc.
2. **[data-sources.md](data-sources.md)** — taxonomy of all the source
   feeds (eParts, LS Engineers, Neyer, DHS, retailer scrapes), SKU prefix
   conventions, per-source coverage breakdowns.
3. **[data-handover.md](data-handover.md)** — working notes from the
   scrape + extraction phases (June 23-25 sessions).
4. **[etl-runbook.md](etl-runbook.md)** — how the one-shot migration from
   Dyvika prod's `Oem*` tables → new OEM DB ran.
5. **[post-etl-runbook.md](post-etl-runbook.md)** — how to drop the
   migrated tables from Dyvika prod and free disk space.

## Architecture in one paragraph

Three-tier data strategy:

- **Tier 1: eParts** — the manufacturer's own catalog API. Primary source
  for BOM data (machines, revisions, diagrams, parts).
- **Tier 2: LS Engineers** — BOM-quality data for big-equipment models
  (excavators, telehandlers) where eParts has no parts books. Only
  ingested for machines where tier 1 is empty.
- **Tier 3: Neyer + DHS** — enrichment for spare parts that don't appear
  in any factory BOM (aftermarket, consumables, service kits). Includes
  retailer descriptions, images, pricing, fitment compatibility.

The Dyvika storefront treats the OEM DB as a read-mostly reference
catalog. Customer purchases, orders, inventory live in the Dyvika DB
(`nxqqmplptalbxmfmbtfs`) and reference OEM data only by string
partNumber.

## File layout

```
prisma/oem/        # Prisma schema + config for the OEM DB
src/lib/oem-db.ts  # Prisma client singleton (used by storefront)
scripts/oem-etl/   # one-shot migration from Dyvika prod (done)
scripts/oem-ingest/  # ongoing ingest scripts (per-source) — TODO
scripts/oem-storage/ # diagram + PDF Storage uploads — TODO
scripts/oem-utils/   # misc OEM scripts — TODO
data/              # raw data: scrapes, PDFs, JSONL, SQLite
docs/oem/          # this folder
```

## Environment variables

```
OEM_DATABASE_URL    # pooler port 6543, ?pgbouncer=true — for runtime
OEM_DIRECT_URL      # pooler port 5432 — for migrations / bulk inserts
```

Both point at `aws-0-eu-west-3.pooler.supabase.com` (the new project's
region). The Dyvika storefront's `DATABASE_URL` + `DIRECT_URL` are
unaffected.
