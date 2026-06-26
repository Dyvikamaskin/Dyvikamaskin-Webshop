# Post-ETL Runbook

After all 8 ETL phases complete and `verify.ts` passes, the OEM data lives
in **both** databases. To free Dyvika prod (currently 806 MB / 500 MB free
quota → forced into read-only mode), you need to DROP the source tables.

This runbook MUST be executed in the Supabase dashboard SQL editor —
read-only mode blocks DDL from external clients (Prisma, psql, MCP), but
the dashboard's editor has elevated write access.

## Pre-flight checklist

Confirm before dropping anything:

1. ✅ All 8 phases completed (check `state/*.json` files in `scripts/oem-etl/state/`)
2. ✅ `verify.ts` row counts: new DB ≥ 95% of old DB counts per table
   (some loss is expected from FK miss filtering)
3. ✅ Spot-check 5 random parts: search the storefront for known
   partNumbers → confirm they resolve correctly against the new OEM DB
4. ✅ A fresh `pg_dump`-style export of the prod OEM tables exists locally
   as a recovery backup. (If not, run `scripts/oem-etl/dump-oem-snapshot.ts`
   first — TODO if needed.)

## Step 1 — Dashboard SQL editor

Open https://supabase.com/dashboard/project/nxqqmplptalbxmfmbtfs/sql/new

## Step 2 — Drop OEM tables from prod

Paste and run. Order matters (FKs).

```sql
-- Free Dyvika prod by dropping the OEM-catalog tables. Total ~700 MB.
-- These tables were copied to the new OEM Supabase project
-- (rtzcrngduscrhgozrojv) via scripts/oem-etl/ on 2026-06-25.
-- Re-import path: scripts/oem-etl/ + state files + the OEM DB itself.

BEGIN;

DROP TABLE IF EXISTS "OemPart" CASCADE;
DROP TABLE IF EXISTS "OemComponent" CASCADE;
DROP TABLE IF EXISTS "OemMachineRevision" CASCADE;
DROP TABLE IF EXISTS "OemMachine" CASCADE;
DROP TABLE IF EXISTS "OemPartListing" CASCADE;
DROP TABLE IF EXISTS "OemPartCompatibility" CASCADE;
DROP TABLE IF EXISTS "PartPriceSnapshot" CASCADE;

DROP TYPE IF EXISTS "OemCatalogSource" CASCADE;

COMMIT;

VACUUM FULL;
```

`VACUUM FULL` is needed to actually reclaim disk space; without it the
dead tuples linger until autovacuum runs.

## Step 3 — Verify DB size

In the same SQL editor:

```sql
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
```

Should return ~50-100 MB. If still over 500 MB, run `VACUUM FULL ANALYZE`
on the remaining tables.

## Step 4 — Remove obsolete Prisma models

Edit `prisma/schema.prisma` and delete:
- `model OemMachine`
- `model OemMachineRevision`
- `model OemComponent`
- `model OemPart`
- `model OemPartListing`
- `model OemPartCompatibility`
- `model PartPriceSnapshot`
- `enum OemCatalogSource`

Then:

```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

Now any storefront code that still references `prisma.oemMachine.*` etc.
will fail to compile. Replace those callsites with the OEM Prisma client
(see Step 5).

## Step 5 — Add OEM Prisma client to the storefront

```bash
npx prisma generate --config prisma/oem/prisma.config.ts
```

Client lands in `src/app/generated/oem-prisma/`. Create a singleton:

```typescript
// src/lib/oem-db.ts
import "dotenv/config";
import { PrismaClient } from "@/app/generated/oem-prisma/client";

declare global { var oemPrisma: PrismaClient | undefined; }
export const oemPrisma = global.oemPrisma || new PrismaClient({
  datasourceUrl: process.env.OEM_DATABASE_URL,
});
if (process.env.NODE_ENV !== "production") global.oemPrisma = oemPrisma;
```

Use it the same way as the main Prisma client, e.g.:

```typescript
const part = await oemPrisma.part.findUnique({
  where: { partNumber: sku },
  include: { lines: { include: { diagram: true } } }
});
```

## Step 6 — Deploy

Production needs `OEM_DATABASE_URL` and `OEM_DIRECT_URL` set as Railway env vars:
- Railway dashboard → Service → Variables → add both
- Value identical to local `.env`

Then redeploy. The OEM Prisma client connects on cold start.

## Recovery — if something goes wrong

If the storefront breaks after Step 4 (Prisma compile errors), simply
restore the Oem* models from git history:

```bash
git checkout <commit-before-step-4> -- prisma/schema.prisma
npx prisma db push
```

If the OEM DB itself goes wrong, the prod tables you dropped are NOT
recoverable from Supabase — only from your local dump file (Step 0). Be
sure that file exists before running Step 2.
