/**
 * Seed OemPartCompatibility rows from the DHS fitment scrape JSONL.
 *
 * Reads `data/dhs_fitment.jsonl` (one product per line,
 * produced by `scrape_dhs_fitment.py`). Each line carries a `fitment[]`
 * array of {name, model, machine_numbers[]} rows that we explode into
 * one OemPartCompatibility row per (sku, model) pair.
 *
 * Idempotent: upserts on the composite unique key (partNumber, machineModel, source).
 * Safe to re-run as the scrape extends or DHS adds new rows.
 *
 *   npx tsx prisma/seed-dhs-fitment.ts
 *
 * Options via env:
 *   DHS_JSONL=path/to/file.jsonl  (default: data/dhs_fitment.jsonl)
 *   DHS_SOURCE=dhs                (default; matches the source tag we use elsewhere)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/app/generated/prisma/client";

const JSONL = resolve(
  process.cwd(),
  process.env.DHS_JSONL ?? "data/dhs_fitment.jsonl",
);
const SOURCE = process.env.DHS_SOURCE ?? "dhs";
const BATCH = 50;
const TX_TIMEOUT_MS = 30_000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type FitmentRow = { name: string; model: string; machine_numbers: string[] };
type ScrapeRow = {
  sku: string;
  url: string;
  status: number;
  title: string | null;
  fitment: FitmentRow[];
  scraped_at: string;
};

async function main() {
  console.log(`Reading ${JSONL} ...`);
  const raw = readFileSync(JSONL, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  console.log(`Found ${lines.length} JSONL lines`);

  let parseErrors = 0;
  const rows: ScrapeRow[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as ScrapeRow);
    } catch {
      parseErrors++;
    }
  }
  console.log(`Parsed ${rows.length} (${parseErrors} parse errors)`);

  // Explode each scrape row into one compat row per (sku, model) pair.
  // Dedupe on (sku, model) — last-write-wins.
  type CompatRow = {
    partNumber: string;
    machineModel: string;
    machineName: string | null;
    machineNumbers: string[];
    source: string;
    sourceUrl: string;
  };
  const byKey = new Map<string, CompatRow>();
  let rowsWithoutFitment = 0;
  for (const r of rows) {
    const sku = (r.sku || "").trim();
    if (!sku || !r.fitment || r.fitment.length === 0) {
      if (!r.fitment || r.fitment.length === 0) rowsWithoutFitment++;
      continue;
    }
    for (const f of r.fitment) {
      const model = (f.model || "").trim();
      if (!model) continue;
      const key = `${sku}|${model}`;
      byKey.set(key, {
        partNumber: sku,
        machineModel: model,
        machineName: (f.name || "").trim() || null,
        machineNumbers: (f.machine_numbers || []).filter(Boolean),
        source: SOURCE,
        sourceUrl: r.url,
      });
    }
  }
  const compatRows = [...byKey.values()];
  console.log(
    `Scrape rows with no fitment: ${rowsWithoutFitment}; ` +
      `unique compat (sku, model) pairs: ${compatRows.length}`,
  );

  // Upsert in batches, mirroring the pattern from seed-oem-listings.ts.
  let written = 0;
  const t0 = Date.now();
  for (let i = 0; i < compatRows.length; i += BATCH) {
    const slice = compatRows.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((c) => {
        const data = {
          partNumber: c.partNumber,
          machineModel: c.machineModel,
          machineName: c.machineName,
          machineNumbers: c.machineNumbers,
          source: c.source,
          sourceUrl: c.sourceUrl,
        };
        return prisma.oemPartCompatibility.upsert({
          where: {
            partNumber_machineModel_source: {
              partNumber: c.partNumber,
              machineModel: c.machineModel,
              source: c.source,
            },
          },
          create: data,
          update: data,
        });
      }),
      { timeout: TX_TIMEOUT_MS },
    );
    written += slice.length;
    if (written % 2000 === 0 || written === compatRows.length) {
      const elapsed = (Date.now() - t0) / 1000;
      console.log(
        `  [${written}/${compatRows.length}] ` +
          `(${elapsed.toFixed(1)}s, ${(written / elapsed).toFixed(0)} rows/s)`,
      );
    }
  }

  console.log(
    `\nDone. Wrote ${written} rows to OemPartCompatibility (source=${SOURCE}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
