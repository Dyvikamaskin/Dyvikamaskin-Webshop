/**
 * Seed OemPartListing + OemPartCompatibility from the LS Engineers browser-
 * driven scrape outputs.
 *
 * Inputs (relative to repo root):
 *   WN manuals an files/lsengineers_wacker_parts.csv      (sitemap-derived;
 *      one row per Wacker part URL with sku/name/model_hint — always present)
 *   WN manuals an files/lsengineers_assemblies.jsonl      (assembly walk;
 *      one row per assembly page with parts[] array containing GBP prices)
 *   WN manuals an files/lsengineers_parts.jsonl           (part-detail walk;
 *      richer per-SKU data: fits_models[], replaces_oem[], description,
 *      image_urls[], price_amount)
 *
 * The first file is mandatory; the JSONLs are optional. The script merges
 * data from all three: the CSV gives us the universe of SKUs; the assembly
 * walk gives prices + assembly breadcrumb context; the part-detail walk
 * gives the richest per-SKU enrichment + cross-machine compatibility.
 *
 * Targets:
 *   OemPartListing  (source='lsengineers-en')      — one row per SKU
 *   OemPartCompatibility (source='lsengineers')    — one row per (sku, model)
 *
 * Idempotent. Re-run after Phase 4 part-detail walk completes to top up.
 *
 *   npx tsx prisma/seed-lsengineers.ts
 *
 * Optional flags via env:
 *   LS_SOURCE_LISTING=lsengineers-en
 *   LS_SOURCE_COMPAT=lsengineers
 *   LS_CSV=WN\ manuals\ an\ files/lsengineers_wacker_parts.csv
 *   LS_ASSEMBLIES_JSONL=WN\ manuals\ an\ files/lsengineers_assemblies.jsonl
 *   LS_PARTS_JSONL=WN\ manuals\ an\ files/lsengineers_parts.jsonl
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/app/generated/prisma/client";

const REPO = process.cwd();
const CSV = resolve(REPO, process.env.LS_CSV ?? "WN manuals an files/lsengineers_wacker_parts.csv");
const ASSEMBLIES = resolve(REPO, process.env.LS_ASSEMBLIES_JSONL ?? "WN manuals an files/lsengineers_assemblies.jsonl");
const PARTS = resolve(REPO, process.env.LS_PARTS_JSONL ?? "WN manuals an files/lsengineers_parts.jsonl");

const SOURCE_LISTING = process.env.LS_SOURCE_LISTING ?? "lsengineers-en";
const SOURCE_COMPAT = process.env.LS_SOURCE_COMPAT ?? "lsengineers";

const BATCH = 50;
const TX_TIMEOUT_MS = 30_000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function parsePounds(text: string | null | undefined): { amount: string | null; currency: string | null } {
  if (!text) return { amount: null, currency: null };
  const m = text.match(/£\s?([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return { amount: null, currency: null };
  return { amount: m[1].replace(/,/g, ""), currency: "GBP" };
}

function parseCsvLine(line: string): string[] {
  // Handles CSV with quoted fields containing commas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

// ─── Load inputs ────────────────────────────────────────────────────────────

type SkuBaseline = {
  sku: string;
  partName: string;
  modelHint: string | null;
  productUrl: string;
};

function loadCsvBaseline(): Map<string, SkuBaseline> {
  console.log(`Reading ${CSV} ...`);
  const raw = readFileSync(CSV, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = {
    sku: header.indexOf("sku"),
    name: header.indexOf("part_name"),
    model: header.indexOf("model_hint"),
    url: header.indexOf("url"),
  };
  const m = new Map<string, SkuBaseline>();
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const sku = (cells[idx.sku] || "").trim();
    if (!sku) continue;
    m.set(sku, {
      sku,
      partName: (cells[idx.name] || "").trim(),
      modelHint: (cells[idx.model] || "").trim() || null,
      productUrl: (cells[idx.url] || "").trim(),
    });
  }
  console.log(`  Loaded ${m.size} baseline SKUs from CSV`);
  return m;
}

// Assembly walk JSONL — typically the format produced by the in-browser
// __lsWalk dump. Shape (resilient to either array of parts or per-page rows):
//   { url, title, breadcrumb: string[], description?, hero_image?, parts: [
//       { sku, position, part_url, name, price_text, image_url, ... } ] }
type AssemblyPage = {
  url: string;
  title?: string;
  breadcrumb?: string[];
  description?: string | null;
  hero_image?: string | null;
  parts?: Array<{
    sku: string;
    position?: number;
    part_url?: string;
    name?: string;
    price_text?: string | null;
    image_url?: string | null;
  }>;
};

type AssemblyEnrich = {
  sku: string;
  assemblyUrl: string;
  assemblyName: string;
  breadcrumb: string;
  price_text: string | null;
  image_url: string | null;
};

function loadAssembliesIfPresent(): Map<string, AssemblyEnrich> {
  const m = new Map<string, AssemblyEnrich>();
  if (!existsSync(ASSEMBLIES)) {
    console.log(`  (no ${ASSEMBLIES} — skipping assembly enrichment)`);
    return m;
  }
  console.log(`Reading ${ASSEMBLIES} ...`);
  const raw = readFileSync(ASSEMBLIES, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  let pages = 0;
  let parts = 0;
  for (const line of lines) {
    let page: AssemblyPage;
    try {
      page = JSON.parse(line) as AssemblyPage;
    } catch {
      continue;
    }
    pages++;
    for (const p of page.parts || []) {
      const sku = (p.sku || "").trim();
      if (!sku) continue;
      // Last-write-wins; pick the page with the most contextual info if duplicate
      const existing = m.get(sku);
      if (existing && existing.price_text && !p.price_text) continue;
      m.set(sku, {
        sku,
        assemblyUrl: page.url,
        assemblyName: page.title || "",
        breadcrumb: (page.breadcrumb || []).join(" > "),
        price_text: p.price_text || null,
        image_url: p.image_url || null,
      });
      parts++;
    }
  }
  console.log(`  Loaded ${pages} assembly pages, ${parts} part-rows; unique SKUs enriched: ${m.size}`);
  return m;
}

// Part-detail walk JSONL — richer per-SKU data:
//   { sku, url, title, breadcrumb: string[], price_text, price_amount,
//     stock_text, description, image_urls: string[],
//     fits_models: string[], replaces_oem: string[], attributes: {...} }
type PartDetail = {
  sku: string;
  url: string;
  title?: string;
  breadcrumb?: string[];
  price_text?: string | null;
  price_amount?: string | null;
  stock_text?: string | null;
  description?: string | null;
  image_urls?: string[];
  fits_models?: string[];
  replaces_oem?: string[];
  attributes?: Record<string, string>;
};

function loadPartDetailsIfPresent(): Map<string, PartDetail> {
  const m = new Map<string, PartDetail>();
  if (!existsSync(PARTS)) {
    console.log(`  (no ${PARTS} — skipping part-detail enrichment)`);
    return m;
  }
  console.log(`Reading ${PARTS} ...`);
  const raw = readFileSync(PARTS, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const d = JSON.parse(line) as PartDetail;
      if (d.sku) m.set(d.sku.trim(), d);
    } catch {
      /* skip */
    }
  }
  console.log(`  Loaded ${m.size} part-detail records`);
  return m;
}

// ─── Build records ──────────────────────────────────────────────────────────

async function main() {
  const baseline = loadCsvBaseline();
  const assemblies = loadAssembliesIfPresent();
  const partDetails = loadPartDetailsIfPresent();

  // 1. Build OemPartListing rows
  type ListingRow = {
    partNumber: string;
    title: string;
    description: string | null;
    descriptionHtml: string | null;
    productType: string | null;
    imageUrls: string[];
    primaryImageUrl: string | null;
    imageCount: number;
    sourceUrl: string;
    price: string | null;
    currency: string | null;
    replacesPartNumbers: string[];
  };
  const listings: ListingRow[] = [];
  for (const [sku, b] of baseline) {
    const a = assemblies.get(sku);
    const d = partDetails.get(sku);
    const { amount, currency } = parsePounds(d?.price_text ?? a?.price_text ?? null);
    const images = [...new Set([...(d?.image_urls ?? []), ...(a?.image_url ? [a.image_url] : [])])].filter((s) => !s.includes("placeholder"));
    const title = d?.title || b.partName || "(no title)";
    listings.push({
      partNumber: sku,
      title,
      description: d?.description || a?.breadcrumb || null,
      descriptionHtml: null,
      productType: b.modelHint, // e.g. "neuson wl28 wheel loader"
      imageUrls: images,
      primaryImageUrl: images[0] || null,
      imageCount: images.length,
      sourceUrl: d?.url || b.productUrl,
      price: d?.price_amount || amount,
      currency: currency,
      replacesPartNumbers: d?.replaces_oem ?? [],
    });
  }
  console.log(`\nBuilt ${listings.length} OemPartListing rows`);

  // 2. Build OemPartCompatibility rows from part-detail fits_models[].
  type CompatRow = {
    partNumber: string;
    machineModel: string;
    machineName: string | null;
    sourceUrl: string;
  };
  const compatByKey = new Map<string, CompatRow>();
  let assemblyHints = 0;
  // From part-detail walk (richer)
  for (const [sku, d] of partDetails) {
    for (const m of d.fits_models || []) {
      const model = m.trim();
      if (!model || model.length < 2 || model.length > 80) continue;
      const key = `${sku}|${model}`;
      compatByKey.set(key, {
        partNumber: sku,
        machineModel: model,
        machineName: null,
        sourceUrl: d.url,
      });
    }
  }
  // Fall back to assembly breadcrumb if we have no fits_models for this SKU
  for (const [sku, a] of assemblies) {
    if ([...compatByKey.keys()].some((k) => k.startsWith(`${sku}|`))) continue;
    // Pull the last useful breadcrumb segment (e.g. "Wacker TH627 (418-02) Telehandler Parts")
    const segments = a.breadcrumb.split(" > ").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    const modelMatch = last.match(/wacker\s+([\w/().-]+)/i);
    if (modelMatch) {
      const model = modelMatch[1].trim();
      const key = `${sku}|${model}`;
      if (!compatByKey.has(key)) {
        compatByKey.set(key, {
          partNumber: sku,
          machineModel: model,
          machineName: a.assemblyName,
          sourceUrl: a.assemblyUrl,
        });
        assemblyHints++;
      }
    }
  }
  console.log(
    `Built ${compatByKey.size} OemPartCompatibility rows ` +
      `(${assemblyHints} via assembly-breadcrumb fallback when no fits_models[])`,
  );

  // ─── Seed OemPartListing ──────────────────────────────────────────────────
  console.log(`\nSeeding OemPartListing (source=${SOURCE_LISTING}) ...`);
  let writtenL = 0;
  const t0L = Date.now();
  for (let i = 0; i < listings.length; i += BATCH) {
    const slice = listings.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((r) => {
        const data = {
          partNumber: r.partNumber,
          source: SOURCE_LISTING,
          title: r.title,
          description: r.description,
          descriptionHtml: r.descriptionHtml,
          productType: r.productType,
          replacesPartNumbers: r.replacesPartNumbers,
          imageUrls: r.imageUrls,
          primaryImageUrl: r.primaryImageUrl,
          imageCount: r.imageCount,
          sourceUrl: r.sourceUrl,
          price: r.price,
          currency: r.currency,
        };
        return prisma.oemPartListing.upsert({
          where: { partNumber_source: { partNumber: r.partNumber, source: SOURCE_LISTING } },
          create: data,
          update: data,
        });
      }),
      { timeout: TX_TIMEOUT_MS },
    );
    writtenL += slice.length;
    if (writtenL % 2000 === 0 || writtenL === listings.length) {
      const e = (Date.now() - t0L) / 1000;
      console.log(`  [${writtenL}/${listings.length}] (${e.toFixed(1)}s, ${(writtenL / e).toFixed(0)} r/s)`);
    }
  }

  // ─── Seed OemPartCompatibility ────────────────────────────────────────────
  console.log(`\nSeeding OemPartCompatibility (source=${SOURCE_COMPAT}) ...`);
  const compatRows = [...compatByKey.values()];
  let writtenC = 0;
  const t0C = Date.now();
  for (let i = 0; i < compatRows.length; i += BATCH) {
    const slice = compatRows.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((c) => {
        const data = {
          partNumber: c.partNumber,
          machineModel: c.machineModel,
          machineName: c.machineName,
          machineNumbers: [],
          source: SOURCE_COMPAT,
          sourceUrl: c.sourceUrl,
        };
        return prisma.oemPartCompatibility.upsert({
          where: {
            partNumber_machineModel_source: {
              partNumber: c.partNumber,
              machineModel: c.machineModel,
              source: SOURCE_COMPAT,
            },
          },
          create: data,
          update: data,
        });
      }),
      { timeout: TX_TIMEOUT_MS },
    );
    writtenC += slice.length;
    if (writtenC % 2000 === 0 || writtenC === compatRows.length) {
      const e = (Date.now() - t0C) / 1000;
      console.log(`  [${writtenC}/${compatRows.length}] (${e.toFixed(1)}s, ${(writtenC / e).toFixed(0)} r/s)`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  OemPartListing rows:        ${writtenL}`);
  console.log(`  OemPartCompatibility rows:  ${writtenC}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
