/**
 * 06b-delete-noncanonical-diagrams.ts
 *
 * Deletes all non-canonical Diagram rows (canonicalDiagramId IS NOT NULL).
 * These have no PartLines and no diagramImageKey after phases 5 and 6.
 *
 * Runs VACUUM ANALYZE on Diagram and PartLine after deletion to reclaim space.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/06b-delete-noncanonical-diagrams.ts
 *   npx tsx scripts/oem-ingest/06b-delete-noncanonical-diagrams.ts --dry-run
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
    SELECT COUNT(*)::int as n FROM "Diagram" WHERE "canonicalDiagramId" IS NOT NULL
  `);
  console.log(`Non-canonical Diagram rows to delete: ${total.toLocaleString()}`);

  if (DRY_RUN) {
    console.log(`Would delete in ${Math.ceil(total / BATCH)} batches, then VACUUM ANALYZE.`);
    await pool.end();
    return;
  }

  let deleted = 0;
  while (true) {
    const { rowCount } = await pool.query(`
      DELETE FROM "Diagram"
      WHERE id IN (
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

  console.log(`\n\n=== Deletion done — ${deleted.toLocaleString()} rows removed ===`);
  console.log(`Running VACUUM ANALYZE on Diagram and PartLine (reclaims disk space)...`);

  await pool.query(`VACUUM ANALYZE "Diagram"`);
  console.log(`  Diagram: done`);
  await pool.query(`VACUUM ANALYZE "PartLine"`);
  console.log(`  PartLine: done`);

  const { rows } = await pool.query(`
    SELECT
      pg_size_pretty(pg_total_relation_size('"Diagram"')) as diagram,
      pg_size_pretty(pg_total_relation_size('"PartLine"')) as partline,
      pg_size_pretty(pg_database_size('oem_catalog')) as total_db
  `);
  console.log(`\nFinal sizes:`, rows[0]);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
