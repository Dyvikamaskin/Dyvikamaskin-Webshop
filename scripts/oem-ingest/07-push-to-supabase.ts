/**
 * 07-push-to-supabase.ts
 *
 * Phase 7 — Push cleaned local PostgreSQL data to Supabase OEM.
 *
 * Streams table by table: Machine → Part → MachineRevision → Diagram →
 * PartLine → PartCompatibility → PartListing → PartPriceSnapshot.
 *
 * Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING throughout.
 * Run with --dry-run to count rows without writing.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/07-push-to-supabase.ts
 *   npx tsx scripts/oem-ingest/07-push-to-supabase.ts --dry-run
 *   npx tsx scripts/oem-ingest/07-push-to-supabase.ts --table=Machine
 */

import { config } from "dotenv";
config(); // loads .env — OEM_DIRECT_URL points to Supabase here
const SUPABASE_OEM_DIRECT_URL = process.env.OEM_DIRECT_URL!; // capture before .env.local overrides it
config({ path: ".env.local", override: true }); // OEM_DATABASE_URL → localhost (source)

import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_TABLE = process.argv.find(a => a.startsWith("--table="))?.split("=")[1];
const BATCH = 500;

// Source: local PostgreSQL
const src = new Pool({ connectionString: process.env.OEM_DATABASE_URL! });

// Target: Supabase OEM (use DIRECT URL to bypass pooler for bulk inserts)
const dst = new Pool({
  connectionString: SUPABASE_OEM_DIRECT_URL,
  max: 5,
  statement_timeout: 120_000,
});

async function countSrc(table: string): Promise<number> {
  const { rows } = await src.query(`SELECT COUNT(*)::int as n FROM "${table}"`);
  return rows[0].n;
}

// Columns that are JSONB (not text[]) — must be JSON.stringified before sending
const JSONB_COLS: Record<string, Set<string>> = {
  Machine:          new Set(["categoryPath", "brochures"]),
  MachineRevision:  new Set(["operatingManuals"]),
  Diagram:          new Set(["hotspotsJson"]),
  PartListing:      new Set(["imageUrls"]),
};

function serializeValue(table: string, col: string, v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && JSONB_COLS[table]?.has(col)) return JSON.stringify(v);
  return v;
}

async function pushTable(
  table: string,
  columns: string[],
  conflictKey: string,
  orderBy = "id"
) {
  if (ONLY_TABLE && ONLY_TABLE !== table) return;

  const total = await countSrc(table);
  console.log(`\n[${table}] ${total.toLocaleString()} rows`);
  if (DRY_RUN) return;

  const cols = columns.map(c => `"${c}"`).join(", ");
  const placeholders = (offset: number) =>
    columns.map((_, i) => `$${offset + i + 1}`).join(", ");

  let offset = 0;
  let inserted = 0;

  while (offset < total) {
    const { rows } = await src.query(
      `SELECT ${cols} FROM "${table}" ORDER BY "${orderBy}" LIMIT $1 OFFSET $2`,
      [BATCH, offset]
    );
    if (!rows.length) break;

    // Build multi-row insert
    const values: any[] = [];
    const rowPlaceholders = rows.map((_, ri) => {
      const ph = placeholders(ri * columns.length);
      columns.forEach(col => {
        values.push(serializeValue(table, col, rows[ri][col]));
      });
      return `(${ph})`;
    });

    await dst.query(
      `INSERT INTO "${table}" (${cols}) VALUES ${rowPlaceholders.join(",")}
       ON CONFLICT (${conflictKey}) DO NOTHING`,
      values
    );

    inserted += rows.length;
    offset += rows.length;
    const pct = Math.round((inserted / total) * 100);
    process.stdout.write(`\r  ${inserted.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
  }
  console.log(`\r  ✓ ${inserted.toLocaleString()} rows pushed`);
}

async function pushPartLine() {
  if (ONLY_TABLE && ONLY_TABLE !== "PartLine") return;

  const total = await countSrc("PartLine");
  console.log(`\n[PartLine] ${total.toLocaleString()} rows`);
  if (DRY_RUN) return;

  const columns = ["diagramId", "partId", "callout", "qty", "notes", "isRecommended"];
  const cols = columns.map(c => `"${c}"`).join(", ");

  let offset = 0;
  let inserted = 0;

  while (offset < total) {
    const { rows } = await src.query(
      `SELECT ${cols} FROM "PartLine" ORDER BY "diagramId", "partId" LIMIT $1 OFFSET $2`,
      [BATCH, offset]
    );
    if (!rows.length) break;

    const values: any[] = [];
    const rowPlaceholders = rows.map((_, ri) => {
      const ph = columns.map((_, i) => `$${ri * columns.length + i + 1}`).join(", ");
      columns.forEach(col => {
        const v = rows[ri][col];
        values.push(v !== null && v !== undefined && typeof v === "object" ? JSON.stringify(v) : v ?? null);
      });
      return `(${ph})`;
    });

    await dst.query(
      `INSERT INTO "PartLine" (${cols}) VALUES ${rowPlaceholders.join(",")}
       ON CONFLICT ("diagramId", "partId", callout) DO NOTHING`,
      values
    );

    inserted += rows.length;
    offset += rows.length;
    const pct = Math.round((inserted / total) * 100);
    process.stdout.write(`\r  ${inserted.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
  }
  console.log(`\r  ✓ ${inserted.toLocaleString()} rows pushed`);
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (ONLY_TABLE) console.log(`Only table: ${ONLY_TABLE}`);

  // Order matters — FKs must be satisfied
  await pushTable("Machine",
    ["id", "code", "source", "displayName", "modelName", "categoryPath",
     "parentMachineId", "primaryImageUrl", "summary", "description",
     "brochures", "isDiscontinued", "createdAt", "updatedAt"],
    "id"
  );

  await pushTable("Part",
    ["id", "partNumber", "aliases", "name", "unitOfMeasure", "isRecommended",
     "sources", "createdAt", "updatedAt"],
    "id"
  );

  await pushTable("MachineRevision",
    ["id", "machineId", "revisionTag", "mode", "sparePartListCode", "hasBom",
     "afCode", "aiCode", "serialFrom", "serialTo", "rawName", "imageUrl",
     "partsManualUrl", "partsManualFilename", "operatingManuals",
     "createdAt", "updatedAt", "bomSource"],
    "id"
  );

  await pushTable("Diagram",
    ["id", "revisionId", "position", "name", "componentCode", "revisionLevel",
     "subRevisionName", "diagramImageKey", "diagramImageSourceId",
     "hotspotsJson", "createdAt", "updatedAt", "partsHash", "canonicalDiagramId"],
    "id"
  );

  await pushPartLine();

  await pushTable("PartCompatibility",
    ["id", "partId", "modelName", "machineId", "source", "scrapedAt"],
    "id"
  );

  await pushTable("PartListing",
    ["id", "partId", "source", "externalSku", "externalUrl", "title",
     "description", "imageUrls", "priceText", "priceAmount", "currency",
     "leadTime", "replacesOem", "machineId", "scrapedAt"],
    "id"
  );

  await pushTable("PartPriceSnapshot",
    ["id", "partNumber", "partId", "retailer", "currency", "price",
     "productName", "productUrl", "imageUrl", "isCallForPrice", "scrapedAt"],
    "id"
  );

  console.log("\n=== Done ===");
  await src.end();
  await dst.end();
}

main().catch(e => { console.error(e); process.exit(1); });
