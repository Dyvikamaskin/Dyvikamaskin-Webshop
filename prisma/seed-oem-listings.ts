/**
 * Seed OemPartListing rows from the Neyer.de deep-crawl JSONL.
 *
 * Reads `WN manuals an files/wn_neyer_full.jsonl` (one product per line,
 * produced by `scrape_neyer_full.py`) and upserts rows keyed on
 * (partNumber, source='neyer-en').
 *
 * Idempotent: re-running upserts. Safe to run while the scrape is still
 * appending lines — picks up where left off via the unique key.
 *
 *   npx tsx prisma/seed-oem-listings.ts
 *
 * Options via env:
 *   NEYER_JSONL=path/to/file.jsonl   (default: WN manuals an files/wn_neyer_full.jsonl)
 *   NEYER_SOURCE=neyer-en            (default; change for other locales)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/app/generated/prisma/client";

const JSONL = resolve(
  process.cwd(),
  process.env.NEYER_JSONL ?? "WN manuals an files/wn_neyer_full.jsonl",
);
const SOURCE = process.env.NEYER_SOURCE ?? "neyer-en";
const BATCH = 50;
const TX_TIMEOUT_MS = 30_000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Row = {
  handle: string;
  locale: string;
  source_product_id: string;
  sku: string;
  title: string;
  product_type: string;
  vendor: string;
  tags: string;
  description_html: string;
  description_text: string;
  replaces_part_numbers: string[];
  price: string | null;
  compare_at_price: string | null;
  currency: string;
  weight: number | null;
  weight_unit: string | null;
  barcode: string | null;
  image_urls: string[];
  image_count: number;
  first_image_url: string | null;
  product_url: string;
  source_created_at: string | null;
  source_updated_at: string | null;
};

function gramsFrom(weight: number | null, unit: string | null): number | null {
  if (weight == null || !unit) return null;
  const w = Number(weight);
  if (!Number.isFinite(w)) return null;
  const u = unit.toLowerCase();
  if (u === "kg") return Math.round(w * 1000);
  if (u === "g") return Math.round(w);
  if (u === "lb") return Math.round(w * 453.592);
  if (u === "oz") return Math.round(w * 28.3495);
  return null;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function main() {
  console.log(`Reading ${JSONL} ...`);
  const raw = readFileSync(JSONL, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  console.log(`Found ${lines.length} JSONL lines`);

  const rows: Row[] = [];
  let parseErrors = 0;
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as Row);
    } catch {
      parseErrors++;
    }
  }
  console.log(`Parsed ${rows.length} (${parseErrors} parse errors)`);

  // Dedupe by sku (in case scrape included duplicate lines after resume).
  const bySku = new Map<string, Row>();
  for (const r of rows) {
    const sku = (r.sku || "").trim();
    if (!sku) continue;
    bySku.set(sku, r); // last write wins (most recent scrape line)
  }
  const unique = [...bySku.values()];
  console.log(`Unique SKUs: ${unique.length}`);

  let written = 0;
  const t0 = Date.now();

  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);

    // Use a transaction of upserts for the batch.
    await prisma.$transaction(
      slice.map((r) => {
        const sku = r.sku.trim();
        const data = {
          partNumber: sku,
          source: SOURCE,
          title: r.title || "",
          description: r.description_text || null,
          descriptionHtml: r.description_html || null,
          productType: r.product_type || null,
          weightGrams: gramsFrom(r.weight, r.weight_unit),
          barcode: r.barcode || null,
          replacesPartNumbers: r.replaces_part_numbers ?? [],
          imageUrls: r.image_urls ?? [],
          primaryImageUrl: r.first_image_url || null,
          imageCount: r.image_count ?? 0,
          sourceProductId: r.source_product_id || null,
          sourceUrl: r.product_url || null,
          sourceCreatedAt: parseDate(r.source_created_at),
          sourceUpdatedAt: parseDate(r.source_updated_at),
          price: r.price || null,
          currency: r.currency || null,
        };
        return prisma.oemPartListing.upsert({
          where: { partNumber_source: { partNumber: sku, source: SOURCE } },
          create: data,
          update: data,
        });
      }),
      { timeout: TX_TIMEOUT_MS },
    );
    written += slice.length;
    if (written % 2000 === 0 || written === unique.length) {
      const elapsed = (Date.now() - t0) / 1000;
      console.log(
        `  [${written}/${unique.length}] (${elapsed.toFixed(1)}s, ${(written / elapsed).toFixed(0)} rows/s)`,
      );
    }
  }

  console.log(`\nDone. Wrote ${written} rows to OemPartListing (source=${SOURCE}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
