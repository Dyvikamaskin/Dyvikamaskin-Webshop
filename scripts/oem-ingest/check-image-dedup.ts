import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  const cols = await prisma.$queryRawUnsafe<any[]>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Diagram' ORDER BY ordinal_position
  `);
  console.log("Diagram columns:", cols.map((c: any) => c.column_name).join(", "));

  const counts = await prisma.$queryRawUnsafe<any[]>(`
    SELECT r."bomSource"::text as src, COUNT(d.id)::int as total,
           COUNT(d."diagramImageKey")::int as has_image
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    GROUP BY r."bomSource"::text
    ORDER BY total DESC
  `);
  console.log("Diagram counts by source:", counts);

  const queries = await prisma.$queryRawUnsafe<any[]>(`
    SELECT pid, round(extract(epoch from now() - query_start))::int as seconds, state, left(query,120) as q
    FROM pg_stat_activity
    WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%'
  `);
  console.log("Active queries:", queries.length ? queries : "none");
}
main().finally(() => prisma.$disconnect());
