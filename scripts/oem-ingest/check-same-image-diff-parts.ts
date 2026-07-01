import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  // Find image keys with >1 distinct partsHash, ordered by diagram count
  const topImages = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "diagramImageKey",
           COUNT(DISTINCT "partsHash")::int AS n_hashes,
           COUNT(*)::int AS n_diagrams
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    WHERE r."bomSource"::text = 'EPARTS_API'
      AND d."diagramImageKey" IS NOT NULL
    GROUP BY "diagramImageKey"
    HAVING COUNT(DISTINCT "partsHash") > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `);

  console.log("Top same-image-diff-parts cases:", JSON.stringify(topImages, null, 2));

  // For the top 3 images, get one representative diagram per partsHash (with parts)
  for (const img of topImages.slice(0, 3)) {
    const reps = await prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT ON (d."partsHash")
        d.id, d.name, d."partsHash", d."diagramImageKey",
        m."displayName" AS machine, r."revisionTag"
      FROM "Diagram" d
      JOIN "MachineRevision" r ON r.id = d."revisionId"
      JOIN "Machine" m ON m.id = r."machineId"
      WHERE d."diagramImageKey" = '${img.diagramImageKey}'
        AND r."bomSource"::text = 'EPARTS_API'
      ORDER BY d."partsHash", d.id
      LIMIT 3
    `);

    for (const rep of reps) {
      const parts = await prisma.$queryRawUnsafe<any[]>(`
        SELECT p."partNumber", p.name, pl.callout, pl.qty
        FROM "PartLine" pl
        JOIN "Part" p ON p.id = pl."partId"
        WHERE pl."diagramId" = '${rep.id}'
        ORDER BY pl.callout
        LIMIT 20
      `);
      rep.parts = parts;
    }

    img.reps = reps;
  }

  console.log(JSON.stringify(topImages.slice(0, 3), null, 2));
}
main().finally(() => prisma.$disconnect());
