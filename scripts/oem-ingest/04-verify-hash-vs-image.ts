/**
 * 04-verify-hash-vs-image.ts
 *
 * Cross-checks partsHash groups against diagramImageKey to verify that
 * identical part-lists always map to identical images (and vice versa).
 *
 * For each source separately:
 *   - How many unique partsHash values?
 *   - Of those groups, how many have >1 distinct diagramImageKey? (false positives)
 *   - How many distinct images map to >1 partsHash? (same image, different parts — surprising)
 *   - Sample of any mismatches for inspection
 */

import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  console.log("=== partsHash ↔ diagramImageKey cross-check ===\n");

  // Per-source summary
  const summary = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      r."bomSource"::text                                       AS source,
      COUNT(DISTINCT d."partsHash")::int                        AS unique_hashes,
      COUNT(DISTINCT d."diagramImageKey")
        FILTER (WHERE d."diagramImageKey" IS NOT NULL)::int     AS unique_images,
      COUNT(*)::int                                             AS total_diagrams,
      -- groups where same hash maps to >1 distinct image (false positives)
      COUNT(*) FILTER (WHERE sub.n_images > 1)::int            AS hash_groups_multi_image,
      -- groups where same image maps to >1 distinct hash
      COUNT(*) FILTER (WHERE sub2.n_hashes > 1)::int           AS image_groups_multi_hash
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    LEFT JOIN (
      SELECT "partsHash", COUNT(DISTINCT "diagramImageKey") AS n_images
      FROM "Diagram" WHERE "diagramImageKey" IS NOT NULL
      GROUP BY "partsHash"
    ) sub ON sub."partsHash" = d."partsHash"
    LEFT JOIN (
      SELECT "diagramImageKey", COUNT(DISTINCT "partsHash") AS n_hashes
      FROM "Diagram" WHERE "diagramImageKey" IS NOT NULL
      GROUP BY "diagramImageKey"
    ) sub2 ON sub2."diagramImageKey" = d."diagramImageKey"
    GROUP BY r."bomSource"::text
    ORDER BY total_diagrams DESC
  `);

  console.log("Per-source summary:");
  for (const row of summary) {
    console.log(`\n  ${row.source}`);
    console.log(`    Total diagrams:              ${row.total_diagrams}`);
    console.log(`    Unique partsHashes:          ${row.unique_hashes}`);
    console.log(`    Unique images:               ${row.unique_images}`);
    console.log(`    Hash groups with >1 image:   ${row.hash_groups_multi_image}  ← false positives`);
    console.log(`    Image groups with >1 hash:   ${row.image_groups_multi_hash}  ← same image, diff parts`);
  }

  // Sample false positives (same hash, different images) for eParts
  const falsePos = await prisma.$queryRawUnsafe<any[]>(`
    SELECT d."partsHash", array_agg(DISTINCT d."diagramImageKey") AS images, COUNT(*)::int AS n_diagrams
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    WHERE r."bomSource"::text = 'EPARTS_API'
      AND d."diagramImageKey" IS NOT NULL
    GROUP BY d."partsHash"
    HAVING COUNT(DISTINCT d."diagramImageKey") > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  if (falsePos.length > 0) {
    console.log(`\n⚠ Sample eParts hash groups with multiple images (top ${falsePos.length}):`);
    for (const row of falsePos) {
      console.log(`  hash=${row.partsHash?.slice(0,8)}… diagrams=${row.n_diagrams} images=${JSON.stringify(row.images?.slice(0,3))}`);
    }
  } else {
    console.log("\n✅ No eParts false positives — every partsHash maps to exactly one image.");
  }

  // Same check for Weidemann using mediaId
  const weidFalsePos = await prisma.$queryRawUnsafe<any[]>(`
    SELECT d."partsHash",
           array_agg(DISTINCT d."diagramImageSourceId") AS media_ids,
           COUNT(*)::int AS n_diagrams
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    WHERE r."bomSource"::text = 'WEIDEMANN_ESERVICE'
      AND d."diagramImageSourceId" IS NOT NULL
    GROUP BY d."partsHash"
    HAVING COUNT(DISTINCT d."diagramImageSourceId") > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  if (weidFalsePos.length > 0) {
    console.log(`\n⚠ Weidemann hash groups with multiple mediaIds (top ${weidFalsePos.length}):`);
    for (const row of weidFalsePos) {
      console.log(`  hash=${row.partsHash?.slice(0,8)}… diagrams=${row.n_diagrams} mediaIds=${JSON.stringify(row.media_ids?.slice(0,3))}`);
    }
  } else {
    console.log("\n✅ No Weidemann false positives — every partsHash maps to exactly one mediaId.");
  }
}
main().finally(() => prisma.$disconnect());
