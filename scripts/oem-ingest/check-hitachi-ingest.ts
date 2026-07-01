import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  const total = await prisma.$queryRawUnsafe<{ n: number }[]>('SELECT COUNT(*)::int as n FROM "Machine"');
  const sources = await prisma.$queryRawUnsafe<any[]>('SELECT source, COUNT(*)::int as n FROM "Machine" GROUP BY source ORDER BY n DESC');
  const hitachi = await prisma.$queryRawUnsafe<{ n: number }[]>('SELECT COUNT(*)::int as n FROM "Machine" WHERE "displayName" ILIKE \'%hitachi%\'');

  console.log("Total machines:", total[0].n);
  console.log("By source:", sources);
  console.log("Hitachi in displayName:", hitachi[0].n);
  await prisma.$disconnect();
}

main().catch(console.error);
