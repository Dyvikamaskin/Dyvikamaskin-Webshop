/**
 * 04-elect-canonicals.ts
 *
 * For each unique partsHash, elect one canonical Diagram and point all
 * duplicates at it via canonicalDiagramId.
 *
 * Election priority (per partsHash group):
 *   1. diagramImageKey IS NOT NULL  (prefer diagrams that have an image)
 *   2. PartLine count DESC          (prefer the most complete BOM)
 *   3. id ASC                       (stable tiebreaker)
 *
 * Safe to re-run: skips groups where all members already agree on a canonical.
 * Runs in batches to avoid long-lived transactions.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/04-elect-canonicals.ts
 *   npx tsx scripts/oem-ingest/04-elect-canonicals.ts --dry-run
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 500; // partsHashes per batch

const pool = new Pool({ connectionString: process.env.OEM_DATABASE_URL! });

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // Fetch all partsHashes that have more than one diagram (the duplicates)
  const { rows: hashes } = await pool.query<{ partsHash: string; n: number }>(`
    SELECT "partsHash", COUNT(*)::int as n
    FROM "Diagram"
    WHERE "partsHash" IS NOT NULL
    GROUP BY "partsHash"
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `);

  console.log(`Duplicate partsHash groups: ${hashes.length}`);
  if (hashes.length === 0) {
    console.log("Nothing to do.");
    await pool.end();
    return;
  }

  let totalElected = 0;
  let totalPointed = 0;
  let alreadyDone = 0;

  for (let i = 0; i < hashes.length; i += BATCH) {
    const batch = hashes.slice(i, i + BATCH).map(r => r.partsHash);

    // For each hash in batch, find the canonical winner
    const { rows: candidates } = await pool.query<{
      id: string;
      partsHash: string;
      canonicalDiagramId: string | null;
      diagramImageKey: string | null;
      partLineCount: number;
    }>(`
      SELECT
        d.id,
        d."partsHash",
        d."canonicalDiagramId",
        d."diagramImageKey",
        COUNT(pl."diagramId")::int AS "partLineCount"
      FROM "Diagram" d
      LEFT JOIN "PartLine" pl ON pl."diagramId" = d.id
      WHERE d."partsHash" = ANY($1::text[])
      GROUP BY d.id, d."partsHash", d."canonicalDiagramId", d."diagramImageKey"
      ORDER BY
        d."partsHash",
        (d."diagramImageKey" IS NOT NULL) DESC,
        COUNT(pl."diagramId") DESC,
        d.id ASC
    `, [batch]);

    // Group by partsHash and elect
    const byHash = new Map<string, typeof candidates>();
    for (const row of candidates) {
      if (!byHash.has(row.partsHash)) byHash.set(row.partsHash, []);
      byHash.get(row.partsHash)!.push(row);
    }

    for (const [hash, group] of byHash) {
      const canonical = group[0]; // already ordered: winner is first
      const duplicates = group.slice(1);

      // Skip if all non-canonicals already point to this canonical
      const alreadyCorrect = duplicates.every(
        d => d.canonicalDiagramId === canonical.id
      );
      if (alreadyCorrect) {
        alreadyDone++;
        continue;
      }

      if (!DRY_RUN) {
        // Clear canonicalDiagramId on the winner (it IS the canonical)
        await pool.query(
          `UPDATE "Diagram" SET "canonicalDiagramId" = NULL WHERE id = $1 AND "canonicalDiagramId" IS NOT NULL`,
          [canonical.id]
        );

        // Point all duplicates at the canonical
        const dupIds = duplicates.map(d => d.id);
        await pool.query(
          `UPDATE "Diagram" SET "canonicalDiagramId" = $1 WHERE id = ANY($2::text[])`,
          [canonical.id, dupIds]
        );
      } else {
        console.log(
          `[dry] hash=${hash.slice(0, 8)}… canonical=${canonical.id} ` +
          `(image=${!!canonical.diagramImageKey}, parts=${canonical.partLineCount}) ` +
          `→ ${duplicates.length} duplicate(s)`
        );
      }

      totalElected++;
      totalPointed += duplicates.length;
    }

    const pct = Math.round(((i + batch.length) / hashes.length) * 100);
    process.stdout.write(
      `\r  Batch ${Math.ceil((i + BATCH) / BATCH)}/${Math.ceil(hashes.length / BATCH)} — ` +
      `elected ${totalElected}, pointed ${totalPointed}, skipped ${alreadyDone} (${pct}%)`
    );
  }

  console.log(`\n\n=== Done ===`);
  console.log(`  Groups elected:   ${totalElected}`);
  console.log(`  Duplicates pointed: ${totalPointed}`);
  console.log(`  Already correct:  ${alreadyDone}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
