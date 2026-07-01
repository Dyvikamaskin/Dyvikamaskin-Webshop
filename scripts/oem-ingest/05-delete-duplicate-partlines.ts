/**
 * 05-delete-duplicate-partlines.ts
 *
 * Deletes PartLines that belong to non-canonical Diagrams
 * (i.e. diagrams where canonicalDiagramId IS NOT NULL).
 *
 * Canonical diagrams (canonicalDiagramId IS NULL) are untouched.
 * Run Phase 4 (04-elect-canonicals.ts) before this.
 *
 * Deletes in batches to avoid locking the table for minutes.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/05-delete-duplicate-partlines.ts
 *   npx tsx scripts/oem-ingest/05-delete-duplicate-partlines.ts --dry-run
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 10_000;

const pool = new Pool({ connectionString: process.env.OEM_DATABASE_URL! });

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  const { rows: [{ n: total }] } = await pool.query<{ n: number }>(`
    SELECT COUNT(*)::int as n
    FROM "PartLine" pl
    JOIN "Diagram" d ON d.id = pl."diagramId"
    WHERE d."canonicalDiagramId" IS NOT NULL
  `);

  console.log(`Duplicate PartLines to delete: ${total.toLocaleString()}`);
  if (total === 0) { console.log("Nothing to do."); await pool.end(); return; }

  if (DRY_RUN) {
    console.log(`Would delete ${total.toLocaleString()} PartLines in ${Math.ceil(total / BATCH)} batches.`);
    await pool.end();
    return;
  }

  let deleted = 0;
  while (true) {
    const { rowCount } = await pool.query(`
      DELETE FROM "PartLine"
      WHERE "diagramId" IN (
        SELECT id FROM "Diagram"
        WHERE "canonicalDiagramId" IS NOT NULL
        LIMIT $1
      )
    `, [BATCH]);

    if (!rowCount) break;
    deleted += rowCount;
    const pct = Math.round((deleted / total) * 100);
    process.stdout.write(`\r  Deleted ${deleted.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
    if (rowCount < BATCH) break;
  }

  console.log(`\n\n=== Done ===`);
  console.log(`  Deleted: ${deleted.toLocaleString()} PartLines`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
