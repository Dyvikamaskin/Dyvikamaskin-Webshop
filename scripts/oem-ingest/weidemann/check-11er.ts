import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  const r = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(d.id)::int as diagrams,
           COUNT(CASE WHEN d."diagramImageKey" IS NULL THEN 1 END)::int as missing_img,
           COUNT(DISTINCT m.id)::int as machines
    FROM "Machine" m
    JOIN "MachineRevision" rev ON rev."machineId" = m.id
    JOIN "Diagram" d ON d."revisionId" = rev.id
    WHERE m."categoryPath"->>1 = '11er_Serie'
  `);
  console.log("11er_Serie in DB:", r[0]);

  // Also check a sample of componentCodes to see if they look valid
  const sample = await prisma.$queryRawUnsafe<any[]>(`
    SELECT d."componentCode", d.name, d."diagramImageKey"
    FROM "Machine" m
    JOIN "MachineRevision" rev ON rev."machineId" = m.id
    JOIN "Diagram" d ON d."revisionId" = rev.id
    WHERE m."categoryPath"->>1 = '11er_Serie'
    LIMIT 10
  `);
  console.log("Sample diagrams:", sample);
  await prisma.$disconnect();
}
main();
