import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  // Get the top false-positive hash with full value
  const top = await prisma.$queryRawUnsafe<any[]>(`
    SELECT d."partsHash", array_agg(DISTINCT d."diagramImageKey") AS images, COUNT(*)::int AS n
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    WHERE r."bomSource"::text = 'EPARTS_API'
      AND d."diagramImageKey" IS NOT NULL
    GROUP BY d."partsHash"
    HAVING COUNT(DISTINCT d."diagramImageKey") > 1
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `);

  const hash = top[0].partsHash;
  const images = top[0].images;
  console.log("Hash:", hash);
  console.log("Images:", images);
  console.log("Diagram count:", top[0].n);

  // Get one representative diagram per image key
  const reps = await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT ON (d."diagramImageKey")
      d.id, d.name, d."diagramImageKey", d."componentCode",
      m."displayName" AS machine, m.id AS "machineId",
      r."revisionTag"
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    JOIN "Machine" m ON m.id = r."machineId"
    WHERE d."partsHash" = '${hash}'
      AND d."diagramImageKey" IS NOT NULL
    ORDER BY d."diagramImageKey", d.id
  `);

  console.log("\nRepresentative diagrams:");
  console.log(JSON.stringify(reps, null, 2));
}
main().finally(() => prisma.$disconnect());
