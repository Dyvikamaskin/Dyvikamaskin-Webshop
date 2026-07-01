import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  const url = process.env.OEM_DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) { console.error("Not local DB — aborting."); process.exit(1); }

  console.log("Adding partsHash + canonicalDiagramId columns…");

  await prisma.$executeRawUnsafe(`ALTER TABLE "Diagram" ADD COLUMN IF NOT EXISTS "partsHash" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Diagram" ADD COLUMN IF NOT EXISTS "canonicalDiagramId" TEXT`);
  console.log("  ✓ Columns added");

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Diagram_partsHash_idx" ON "Diagram"("partsHash")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Diagram_canonicalDiagramId_idx" ON "Diagram"("canonicalDiagramId")`);
  console.log("  ✓ Indexes created");

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Diagram_canonicalDiagramId_fkey'
      ) THEN
        ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_canonicalDiagramId_fkey"
          FOREIGN KEY ("canonicalDiagramId") REFERENCES "Diagram"(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  console.log("  ✓ Foreign key added");

  // Verify
  const cols = await prisma.$queryRawUnsafe<any[]>(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'Diagram' AND column_name IN ('partsHash','canonicalDiagramId')
  `);
  console.log("Columns confirmed:", cols);
}
main().finally(() => prisma.$disconnect());
