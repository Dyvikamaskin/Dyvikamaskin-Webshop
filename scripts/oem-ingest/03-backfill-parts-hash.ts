/**
 * 03-backfill-parts-hash.ts
 *
 * Phase 3: Backfill Diagram.partsHash for all diagrams that don't have one yet.
 * Hash = MD5(string_agg(partId||'|'||callout||'|'||coalesce(qty,0) ORDER BY callout, partId))
 * Empty part-list → MD5('EMPTY')
 *
 * Runs in batches of 5,000 to avoid OOM. Safe to rerun (skips already-hashed).
 * ~30 min for 474K diagrams.
 *
 * Usage: npx tsx scripts/oem-ingest/03-backfill-parts-hash.ts [--batch=N]
 */

import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const BATCH = (() => { const a = process.argv.find(x => x.startsWith("--batch=")); return a ? parseInt(a.split("=")[1]) : 5000; })();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  const url = process.env.OEM_DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) { console.error("Not local DB — aborting."); process.exit(1); }

  const total = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as n FROM "Diagram" WHERE "partsHash" IS NULL`);
  console.log(`Diagrams needing partsHash: ${total[0].n}  (batch size: ${BATCH})`);
  if (total[0].n === 0) { console.log("Nothing to do."); return; }

  const t0 = Date.now();
  let done = 0;

  while (true) {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "Diagram" d
      SET "partsHash" = sub.h
      FROM (
        SELECT d2.id,
               md5(coalesce(
                 string_agg(pl."partId" || '|' || pl.callout || '|' || coalesce(pl.qty, 0)::text,
                            ',' ORDER BY pl.callout, pl."partId"),
                 'EMPTY'
               )) AS h
        FROM "Diagram" d2
        LEFT JOIN "PartLine" pl ON pl."diagramId" = d2.id
        WHERE d2."partsHash" IS NULL
        GROUP BY d2.id
        LIMIT ${BATCH}
      ) sub
      WHERE d.id = sub.id
    `);

    done += result;
    const rate = Math.round(done / ((Date.now() - t0) / 1000));
    console.log(`  Updated ${done} / ${total[0].n}  (${rate}/s)`);

    if (result === 0) break;
  }

  const remaining = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as n FROM "Diagram" WHERE "partsHash" IS NULL`);
  console.log(`\n=== Done ===`);
  console.log(`Hashed: ${done}`);
  console.log(`Still null: ${remaining[0].n}`);
  console.log(`Elapsed: ${Math.round((Date.now() - t0) / 1000)}s`);
}
main().finally(() => prisma.$disconnect());
