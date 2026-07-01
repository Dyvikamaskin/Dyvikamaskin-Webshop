/**
 * 04-transfer-from-supabase.ts
 *
 * Transfers non-eParts data from the OEM Supabase project into the local
 * PostgreSQL database. Runs in four passes:
 *
 *   1. PDF Machines + MachineRevisions  (new rows, no FK remapping needed)
 *   2. PartPriceSnapshot                (partNumber is text, partId backfilled)
 *   3. PartCompatibility                (partId remapped via partNumber)
 *   4. PartListing                      (partId + machineId remapped)
 *
 * Idempotent — uses upsert / ON CONFLICT DO NOTHING throughout.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/04-transfer-from-supabase.ts
 *   npx tsx scripts/oem-ingest/04-transfer-from-supabase.ts --pass 1
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";

const BATCH = 500;

// ── Connection to Supabase OEM (source) ───────────────────────────────────────
const SB_URL =
  "postgresql://postgres.rtzcrngduscrhgozrojv:749htyPUp31daayO@aws-0-eu-west-3.pooler.supabase.com:5432/postgres";

const sbPool = new pg.Pool({ connectionString: SB_URL, max: 3 });

async function sbQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
  const { rows } = await sbPool.query(sql, params);
  return rows as T[];
}

// ── Local Prisma (target) ──────────────────────────────────────────────────────
const local = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.OEM_DIRECT_URL! }),
});

// ── CLI ───────────────────────────────────────────────────────────────────────
const passArg = process.argv.includes("--pass")
  ? parseInt(process.argv[process.argv.indexOf("--pass") + 1])
  : null;

const run = (n: number) => passArg === null || passArg === n;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function paginate<T>(
  query: (offset: number) => Promise<T[]>,
  handler: (batch: T[]) => Promise<void>,
  label: string
) {
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = await query(offset);
    if (!rows.length) break;
    await handler(rows);
    total += rows.length;
    offset += rows.length;
    process.stdout.write(`\r  ${label}: ${total}`);
  }
  console.log(`\r  ${label}: ${total} done`);
}

// ── Pass 1: PDF Machines + MachineRevisions ───────────────────────────────────
async function pass1() {
  console.log("\n[Pass 1] PDF Machines + MachineRevisions");

  await paginate(
    (offset) =>
      sbQuery(
        `SELECT * FROM "Machine" WHERE source = 'PDF' ORDER BY id LIMIT $1 OFFSET $2`,
        [BATCH, offset]
      ),
    async (rows) => {
      for (const m of rows) {
        await local.machine.upsert({
          where: { code_source: { code: m.code, source: "PDF" } },
          create: {
            code: m.code,
            source: "PDF",
            displayName: m.displayName,
            modelName: m.modelName,
            categoryPath: m.categoryPath,
            primaryImageUrl: m.primaryImageUrl,
            summary: m.summary,
            description: m.description,
            isDiscontinued: m.isDiscontinued,
          },
          update: {},
        });
      }
    },
    "machines"
  );

  // Build local code→id map for PDF machines (needed for revisions)
  const pdfMachines = await local.machine.findMany({
    where: { source: "PDF" },
    select: { id: true, code: true },
  });
  const machineIdByCode = new Map(pdfMachines.map((m) => [m.code, m.id]));

  // Fetch PDF machine codes from Supabase to resolve machineId
  const sbPdfMachines = await sbQuery<{ id: string; code: string }>(
    `SELECT id, code FROM "Machine" WHERE source = 'PDF'`
  );
  const sbCodeById = new Map(sbPdfMachines.map((m) => [m.id, m.code]));

  await paginate(
    (offset) =>
      sbQuery(
        `SELECT r.* FROM "MachineRevision" r
         JOIN "Machine" m ON m.id = r."machineId"
         WHERE m.source = 'PDF'
         ORDER BY r.id LIMIT $1 OFFSET $2`,
        [BATCH, offset]
      ),
    async (rows) => {
      for (const r of rows) {
        const code = sbCodeById.get(r.machineId);
        if (!code) continue;
        const localMachineId = machineIdByCode.get(code);
        if (!localMachineId) continue;

        await local.machineRevision.upsert({
          where: {
            machineId_revisionTag: {
              machineId: localMachineId,
              revisionTag: r.revisionTag,
            },
          },
          create: {
            machineId: localMachineId,
            revisionTag: r.revisionTag,
            mode: r.mode,
            sparePartListCode: r.sparePartListCode,
            hasBom: r.hasBom,
            afCode: r.afCode,
            aiCode: r.aiCode,
            serialFrom: r.serialFrom,
            serialTo: r.serialTo,
            rawName: r.rawName,
            imageUrl: r.imageUrl,
            partsManualUrl: r.partsManualUrl,
            partsManualFilename: r.partsManualFilename,
            operatingManuals: r.operatingManuals,
          },
          update: {},
        });
      }
    },
    "revisions"
  );
}

// ── Pass 2: PartPriceSnapshot ─────────────────────────────────────────────────
async function pass2() {
  console.log("\n[Pass 2] PartPriceSnapshot");

  const localParts = await local.part.findMany({
    select: { id: true, partNumber: true },
  });
  const partIdByNumber = new Map(localParts.map((p) => [p.partNumber, p.id]));

  // Single persistent pool for all inserts
  const localPool = new pg.Pool({ connectionString: process.env.OEM_DIRECT_URL!, max: 5 });

  await paginate(
    (offset) =>
      sbQuery(
        `SELECT * FROM "PartPriceSnapshot" ORDER BY id LIMIT $1 OFFSET $2`,
        [BATCH, offset]
      ),
    async (rows) => {
      const values = rows.map((r) => [
        r.id,
        r.partNumber,
        r.partNumber ? (partIdByNumber.get(r.partNumber) ?? null) : null,
        r.retailer,
        r.currency,
        r.price,
        r.productName,
        r.productUrl,
        r.imageUrl,
        r.isCallForPrice,
        r.scrapedAt,
      ]);
      // Bulk insert the whole batch in one query
      const placeholders = values
        .map(
          (_, i) =>
            `($${i * 11 + 1},$${i * 11 + 2},$${i * 11 + 3},$${i * 11 + 4},$${i * 11 + 5},$${i * 11 + 6},$${i * 11 + 7},$${i * 11 + 8},$${i * 11 + 9},$${i * 11 + 10},$${i * 11 + 11})`
        )
        .join(",");
      await localPool.query(
        `INSERT INTO "PartPriceSnapshot"
           ("id","partNumber","partId","retailer","currency","price","productName","productUrl","imageUrl","isCallForPrice","scrapedAt")
         VALUES ${placeholders} ON CONFLICT ("id") DO NOTHING`,
        values.flat()
      );
    },
    "snapshots"
  );

  await localPool.end();
}

// ── Pass 3: PartCompatibility ─────────────────────────────────────────────────
async function pass3() {
  console.log("\n[Pass 3] PartCompatibility (DHS + LSENGINEERS)");

  const localParts = await local.part.findMany({
    select: { id: true, partNumber: true },
  });
  const partIdByNumber = new Map(localParts.map((p) => [p.partNumber, p.id]));

  const localMachines = await local.machine.findMany({
    select: { id: true, code: true, source: true },
  });
  const machineIdByCodeSource = new Map(
    localMachines.map((m) => [`${m.code}::${m.source}`, m.id])
  );

  // Fetch Supabase machine code+source for ID remapping
  const sbMachines = await sbQuery<{ id: string; code: string; source: string }>(
    `SELECT id, code, source FROM "Machine"`
  );
  const sbMachineCodeSource = new Map(
    sbMachines.map((m) => [m.id, `${m.code}::${m.source}`])
  );

  // Fetch Supabase parts for partNumber lookup
  const sbParts = await sbQuery<{ id: string; "partNumber": string }>(
    `SELECT id, "partNumber" FROM "Part"`
  );
  const sbPartNumber = new Map(sbParts.map((p) => [p.id, p.partNumber]));

  await paginate(
    (offset) =>
      sbQuery(
        `SELECT * FROM "PartCompatibility"
         WHERE source IN ('DHS','LSENGINEERS')
         ORDER BY id LIMIT $1 OFFSET $2`,
        [BATCH, offset]
      ),
    async (rows) => {
      for (const r of rows) {
        const partNumber = sbPartNumber.get(r.partId);
        if (!partNumber) continue;
        const localPartId = partIdByNumber.get(partNumber);
        if (!localPartId) continue;

        let localMachineId: string | null = null;
        if (r.machineId) {
          const codeSource = sbMachineCodeSource.get(r.machineId);
          if (codeSource) localMachineId = machineIdByCodeSource.get(codeSource) ?? null;
        }

        try {
          await local.partCompatibility.upsert({
            where: {
              partId_modelName_source: {
                partId: localPartId,
                modelName: r.modelName,
                source: r.source,
              },
            },
            create: {
              partId: localPartId,
              modelName: r.modelName,
              machineId: localMachineId,
              source: r.source,
              scrapedAt: r.scrapedAt,
            },
            update: {},
          });
        } catch {
          // skip duplicates
        }
      }
    },
    "compat rows"
  );
}

// ── Pass 4: PartListing ───────────────────────────────────────────────────────
async function pass4() {
  console.log("\n[Pass 4] PartListing");

  const localParts = await local.part.findMany({
    select: { id: true, partNumber: true },
  });
  const partIdByNumber = new Map(localParts.map((p) => [p.partNumber, p.id]));

  const sbParts = await sbQuery<{ id: string; "partNumber": string }>(
    `SELECT id, "partNumber" FROM "Part"`
  );
  const sbPartNumber = new Map(sbParts.map((p) => [p.id, p.partNumber]));

  await paginate(
    (offset) =>
      sbQuery(
        `SELECT * FROM "PartListing" ORDER BY id LIMIT $1 OFFSET $2`,
        [BATCH, offset]
      ),
    async (rows) => {
      for (const r of rows) {
        const partNumber = sbPartNumber.get(r.partId);
        if (!partNumber) continue;
        const localPartId = partIdByNumber.get(partNumber);
        if (!localPartId) continue;

        try {
          await local.partListing.upsert({
            where: {
              source_externalSku: {
                source: r.source,
                externalSku: r.externalSku,
              },
            },
            create: {
              partId: localPartId,
              source: r.source,
              externalSku: r.externalSku,
              externalUrl: r.externalUrl,
              title: r.title,
              description: r.description,
              imageUrls: r.imageUrls,
              priceText: r.priceText,
              priceAmount: r.priceAmount,
              currency: r.currency,
              leadTime: r.leadTime,
              replacesOem: r.replacesOem,
              scrapedAt: r.scrapedAt,
            },
            update: {},
          });
        } catch {
          // skip duplicates
        }
      }
    },
    "listings"
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Source: Supabase OEM (rtzcrngduscrhgozrojv)");
  console.log("Target: local PostgreSQL (oem_catalog)");

  if (run(1)) await pass1();
  if (run(2)) await pass2();
  if (run(3)) await pass3();
  if (run(4)) await pass4();

  console.log("\n=== Transfer complete ===");
  await sbPool.end();
  await local.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
