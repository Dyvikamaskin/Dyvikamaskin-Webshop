/**
 * 04-download-diagrams.ts
 *
 * Downloads all unique diagram PNGs from the eParts media API, compresses
 * them to WebP (85% quality, max 1200px wide), and saves both versions to disk.
 *
 * Source:  /ws/v2/amd/media/{diagramImageSourceId}/{diagramImageKey}
 * Raw:     data/eparts_assets/{filename}           (original PNG, kept as fallback)
 * WebP:    data/eparts_assets_webp/{stem}.webp     (compressed, for Supabase upload)
 *
 * Deduplication: queries DB for DISTINCT (diagramImageKey, diagramImageSourceId)
 * pairs, skips files already on disk (both raw and WebP output).
 *
 * Idempotent — safe to re-run. Progress saved to data/eparts_assets/_download_progress.json.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/eparts/04-download-diagrams.ts
 *   npx tsx scripts/oem-ingest/eparts/04-download-diagrams.ts --skip-compress
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { Client } from "pg";
import sharp from "sharp";

const ASSETS_DIR = path.join(process.cwd(), "data", "eparts_assets");
const WEBP_DIR = path.join(process.cwd(), "data", "eparts_assets_webp");
const PROGRESS_FILE = path.join(ASSETS_DIR, "_download_progress.json");
const BASE = "https://shop.wackerneuson.com";
const CONCURRENCY = 8;
const DELAY_MS = 100;
const SKIP_COMPRESS = process.argv.includes("--skip-compress");

// WebP compression settings
const WEBP_QUALITY = 70;
const MAX_WIDTH = 1200;

type Progress = { done: string[]; errors: string[] };

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return { done: [], errors: [] };
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadPng(sourceId: string, filename: string): Promise<Buffer> {
  const url = `${BASE}/ws/v2/amd/media/${sourceId}/${filename}?lang=en_US&mode=unrestricted`;
  const res = await fetch(url, {
    headers: {
      Accept: "image/png,image/*,*/*",
      "Accept-Language": "en_US",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function compressToWebp(pngPath: string, webpPath: string): Promise<void> {
  await sharp(pngPath)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(webpPath);
}

async function runConcurrently<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.mkdirSync(WEBP_DIR, { recursive: true });

  const c = new Client({ connectionString: process.env.OEM_DIRECT_URL! });
  await c.connect();

  // Fetch all unique (key, sourceId) pairs from DB
  const { rows } = await c.query<{ key: string; sourceId: string }>(`
    SELECT "diagramImageKey" AS key, "diagramImageSourceId" AS "sourceId"
    FROM "Diagram"
    WHERE "diagramImageKey" IS NOT NULL
      AND "diagramImageSourceId" IS NOT NULL
      AND "diagramImageKey" LIKE '%.png'
    GROUP BY "diagramImageKey", "diagramImageSourceId"
    ORDER BY "diagramImageKey"
  `);
  await c.end();

  console.log(`Total unique PNG entries in DB: ${rows.length.toLocaleString()}`);

  const progress = loadProgress();
  const doneSet = new Set(progress.done);

  // Filter to only what needs downloading
  const todo = rows.filter((r) => {
    const pngPath = path.join(ASSETS_DIR, r.key);
    const webpPath = path.join(WEBP_DIR, r.key.replace(/\.png$/i, ".webp"));
    const key = `${r.sourceId}/${r.key}`;
    if (doneSet.has(key)) return false;
    // If both files already exist, mark done and skip
    if (fs.existsSync(pngPath) && (SKIP_COMPRESS || fs.existsSync(webpPath))) {
      progress.done.push(key);
      doneSet.add(key);
      return false;
    }
    return true;
  });

  saveProgress(progress);
  console.log(`Already done: ${progress.done.length.toLocaleString()}`);
  console.log(`To download:  ${todo.length.toLocaleString()}`);
  if (todo.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let downloaded = 0;
  let compressed = 0;
  let errors = 0;
  const startTime = Date.now();

  await runConcurrently(
    todo,
    async (r) => {
      const key = `${r.sourceId}/${r.key}`;
      const pngPath = path.join(ASSETS_DIR, r.key);
      const webpPath = path.join(WEBP_DIR, r.key.replace(/\.png$/i, ".webp"));
      try {
        // Download PNG if not already on disk
        if (!fs.existsSync(pngPath)) {
          const buf = await downloadPng(r.sourceId, r.key);
          fs.writeFileSync(pngPath, buf);
          downloaded++;
          await sleep(DELAY_MS);
        }

        // Compress to WebP
        if (!SKIP_COMPRESS && !fs.existsSync(webpPath)) {
          await compressToWebp(pngPath, webpPath);
          compressed++;
        }

        progress.done.push(key);
        doneSet.add(key);
        saveProgress(progress);

        const elapsed = (Date.now() - startTime) / 1000;
        const total = progress.done.length;
        const rate = total / elapsed;
        const remaining = Math.round((todo.length - (total - (progress.done.length - todo.length))) / rate);
        process.stdout.write(
          `\r  ${total - (progress.done.length - todo.length - downloaded - compressed + downloaded)}/${todo.length} done` +
          `  dl=${downloaded} webp=${compressed} err=${errors}` +
          `  ${rate.toFixed(1)}/s`
        );
      } catch (e: any) {
        errors++;
        progress.errors.push(key);
        saveProgress(progress);
        process.stderr.write(`\n  Error ${r.key}: ${e.message}\n`);
      }
    },
    CONCURRENCY
  );

  console.log(`\n\n=== Done ===`);
  console.log(`  Downloaded: ${downloaded} new PNGs`);
  console.log(`  Compressed: ${compressed} WebPs`);
  console.log(`  Errors:     ${errors}`);
  console.log(`  Total done: ${progress.done.length.toLocaleString()}`);

  // Print size summary
  const pngSizeMB = fs.readdirSync(ASSETS_DIR)
    .filter(f => f.endsWith('.png'))
    .reduce((sum, f) => sum + fs.statSync(path.join(ASSETS_DIR, f)).size, 0) / 1e6;
  const webpSizeMB = fs.existsSync(WEBP_DIR) ? fs.readdirSync(WEBP_DIR)
    .filter(f => f.endsWith('.webp'))
    .reduce((sum, f) => sum + fs.statSync(path.join(WEBP_DIR, f)).size, 0) / 1e6 : 0;

  console.log(`\n  PNG total on disk:  ${pngSizeMB.toFixed(0)} MB`);
  console.log(`  WebP total on disk: ${webpSizeMB.toFixed(0)} MB`);
  if (webpSizeMB > 0) {
    console.log(`  Compression ratio:  ${(webpSizeMB / pngSizeMB * 100).toFixed(0)}%`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
