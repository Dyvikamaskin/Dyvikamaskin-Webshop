/**
 * 06-dedup-images.ts
 *
 * Phase 6 — Image dedup:
 *   1. Null out diagramImageKey on all non-canonical Diagrams (DB cleanup).
 *   2. Delete orphaned image files from data/eparts_assets/ and
 *      data/eparts_assets_webp/ — files no longer referenced by any canonical.
 *
 * Run after Phase 5 (05-delete-duplicate-partlines.ts).
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/06-dedup-images.ts
 *   npx tsx scripts/oem-ingest/06-dedup-images.ts --dry-run
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const ASSETS_DIR = path.join(process.cwd(), "data", "eparts_assets");
const WEBP_DIR = path.join(process.cwd(), "data", "eparts_assets_webp");

const pool = new Pool({ connectionString: process.env.OEM_DATABASE_URL! });

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // ── Step 1: Collect canonical image keys (keep these) ──────────────────────
  console.log("\n[1/3] Collecting canonical image keys...");
  const { rows: canonicalRows } = await pool.query<{ diagramImageKey: string }>(`
    SELECT DISTINCT "diagramImageKey"
    FROM "Diagram"
    WHERE "canonicalDiagramId" IS NULL
      AND "diagramImageKey" IS NOT NULL
  `);
  const canonicalKeys = new Set(canonicalRows.map(r => r.diagramImageKey));
  console.log(`  Canonical image keys: ${canonicalKeys.size.toLocaleString()}`);

  // ── Step 2: Null out diagramImageKey on non-canonicals ─────────────────────
  console.log("\n[2/3] Nulling diagramImageKey on non-canonical diagrams...");
  const { rows: [{ n: toNull }] } = await pool.query<{ n: number }>(`
    SELECT COUNT(*)::int as n FROM "Diagram"
    WHERE "canonicalDiagramId" IS NOT NULL AND "diagramImageKey" IS NOT NULL
  `);
  console.log(`  To null: ${toNull.toLocaleString()}`);

  if (!DRY_RUN && toNull > 0) {
    const { rowCount } = await pool.query(`
      UPDATE "Diagram" SET "diagramImageKey" = NULL
      WHERE "canonicalDiagramId" IS NOT NULL AND "diagramImageKey" IS NOT NULL
    `);
    console.log(`  Nulled: ${rowCount?.toLocaleString()}`);
  } else if (DRY_RUN) {
    console.log(`  [dry] Would null ${toNull.toLocaleString()} rows`);
  }

  // ── Step 3: Delete orphaned files from disk ─────────────────────────────────
  console.log("\n[3/3] Scanning for orphaned image files on disk...");

  let deletedPng = 0, deletedWebp = 0, keptPng = 0, missingWebp = 0;

  if (!fs.existsSync(ASSETS_DIR)) {
    console.log(`  ${ASSETS_DIR} does not exist — skipping file cleanup`);
  } else {
    const files = fs.readdirSync(ASSETS_DIR).filter(f => !f.startsWith("_"));
    console.log(`  Files in eparts_assets: ${files.length.toLocaleString()}`);

    for (const file of files) {
      if (canonicalKeys.has(file)) {
        keptPng++;
        continue;
      }
      // Orphan — not referenced by any canonical diagram
      const pngPath = path.join(ASSETS_DIR, file);
      const webpPath = path.join(WEBP_DIR, file.replace(/\.png$/i, ".webp"));

      if (DRY_RUN) {
        deletedPng++;
        if (fs.existsSync(webpPath)) deletedWebp++;
      } else {
        try { fs.unlinkSync(pngPath); deletedPng++; } catch {}
        if (fs.existsSync(webpPath)) {
          try { fs.unlinkSync(webpPath); deletedWebp++; } catch {}
        } else {
          missingWebp++;
        }
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  DB rows nulled:       ${DRY_RUN ? "(dry) " : ""}${toNull.toLocaleString()}`);
  console.log(`  PNG files deleted:    ${DRY_RUN ? "(dry) " : ""}${deletedPng.toLocaleString()}`);
  console.log(`  WebP files deleted:   ${DRY_RUN ? "(dry) " : ""}${deletedWebp.toLocaleString()}`);
  console.log(`  Files kept (canonical): ${keptPng.toLocaleString()}`);
  if (missingWebp) console.log(`  WebP missing (no-op):  ${missingWebp.toLocaleString()}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
