/**
 * Seed PartPriceSnapshot rows from the seven retailer scrape CSVs.
 *
 * Reads `data/wn_*.csv` and writes one row per CSV row
 * into PartPriceSnapshot — keyed only by partNumber + retailer (no FK
 * to OemPart because the retailer catalogs carry many SKUs that aren't
 * in the OEM catalog).
 *
 * Idempotent on the retailer tag: each run deletes existing rows for a
 * retailer before re-inserting. (We're capturing the *current* scrape,
 * not history — if you want history, change the delete step to a
 * scrapedAt-bucketed insert.)
 *
 * Run order: independent of the other two OEM seeds.
 *
 *   npx tsx prisma/seed-part-prices.ts
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/app/generated/prisma/client";

const ROOT = resolve(process.cwd(), "data");

/** Seven scrape CSVs → (file, retailerTag).
 *  The tags are short, stable identifiers used in PartPriceSnapshot.retailer.
 *  wn_tmsequip.csv (the old 72-row brand listing) is superseded by
 *  wn_tmsequip_full.csv — skip it.
 *  wn_dhs.csv (brand-listing only) is also superseded by wn_dhs_klevu.csv —
 *  but keep both: the brand listing has 600 rows that don't all appear in
 *  the Klevu 146k either, and they're cheap.
 */
const SOURCES: Array<{ file: string; retailer: string }> = [
  { file: "wn_hydrotech.csv", retailer: "hydrotech" },
  { file: "wn_danseusa.csv", retailer: "danseusa" },
  { file: "wn_russopower.csv", retailer: "russopower" },
  { file: "wn_dhs.csv", retailer: "dhs-brand" },
  { file: "wn_contractorsdirect.csv", retailer: "contractorsdirect" },
  { file: "wn_tmsequip_full.csv", retailer: "tmsequip" },
  { file: "wn_dhs_klevu.csv", retailer: "dhs-klevu" },
];

const BATCH = 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Parse a single CSV row using RFC 4180-ish rules (Python's csv module
 *  defaults). Handles quoted fields, embedded commas, and "" escapes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function* streamCsvRows(path: string): AsyncGenerator<Record<string, string>> {
  // Handle quoted fields that span multiple lines by joining until quotes
  // balance. This is rare in our CSVs but safer.
  const stream = createReadStream(path, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  let buffer = "";
  for await (const rawLine of rl) {
    buffer = buffer.length === 0 ? rawLine : buffer + "\n" + rawLine;
    // Count unescaped quotes — if odd, the row continues.
    let count = 0;
    for (let i = 0; i < buffer.length; i++) if (buffer[i] === '"') count++;
    if (count % 2 !== 0) continue;
    const fields = parseCsvLine(buffer);
    buffer = "";
    if (header === null) {
      header = fields.map((h) => h.trim());
      continue;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = fields[i] ?? "";
    yield row;
  }
}

function isCallForPrice(price: string | undefined): boolean {
  if (!price) return true;
  const v = price.trim().toLowerCase();
  return v === "" || v === "poa" || v === "call" || v === "n/a";
}

async function ingestRetailer(file: string, retailer: string): Promise<{ rows: number; written: number }> {
  const path = resolve(ROOT, file);
  let rowCount = 0;
  let batch: Prisma.PartPriceSnapshotCreateManyInput[] = [];

  // Wipe out previous rows for this retailer.
  const before = await prisma.partPriceSnapshot.count({ where: { retailer } });
  if (before > 0) {
    console.log(`  clearing ${before} existing rows for retailer=${retailer}`);
    await prisma.partPriceSnapshot.deleteMany({ where: { retailer } });
  }

  let written = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.partPriceSnapshot.createMany({ data: batch });
    written += batch.length;
    batch = [];
  };

  for await (const row of streamCsvRows(path)) {
    const partNumber = (row["part_number"] || "").trim();
    if (!partNumber) continue;
    rowCount++;
    const price = (row["price"] || "").trim();
    batch.push({
      partNumber,
      retailer,
      currency: (row["currency"] || "USD").trim() || "USD",
      price: price || null,
      productName: (row["name"] || row["title"] || "").trim() || null,
      productUrl: (row["product_url"] || "").trim() || null,
      imageUrl: (row["image_url"] || "").trim() || null,
      isCallForPrice: isCallForPrice(price),
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return { rows: rowCount, written };
}

async function main() {
  const t0 = Date.now();
  let totalRows = 0;
  let totalWritten = 0;
  for (const src of SOURCES) {
    console.log(`Ingesting ${src.file} as retailer=${src.retailer}`);
    const t = Date.now();
    try {
      const r = await ingestRetailer(src.file, src.retailer);
      const elapsed = (Date.now() - t) / 1000;
      console.log(
        `  → ${r.rows} rows seen, ${r.written} written (${elapsed.toFixed(1)}s)`,
      );
      totalRows += r.rows;
      totalWritten += r.written;
    } catch (e) {
      console.error(`  ! failed: ${(e as Error).message}`);
    }
  }
  const elapsed = (Date.now() - t0) / 1000;
  console.log();
  console.log("Done.");
  console.log(`  rows seen:    ${totalRows}`);
  console.log(`  rows written: ${totalWritten}`);
  console.log(`  elapsed:      ${elapsed.toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
