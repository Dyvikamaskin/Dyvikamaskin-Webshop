/**
 * 02-download-images.ts
 *
 * Downloads hero_image thumbnails for LS Engineers diagrams and updates
 * the diagramImageKey column in the local OEM DB.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/lsengineers/02-download-images.ts [--dry-run]
 *
 * Images are saved to: data/eparts_assets/ls/<filename>
 * diagramImageKey is set to: ls/<filename>
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import * as fs from "fs";
import * as path from "path";
import https from "https";
import http from "http";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const DIAGRAMS_FILE = path.resolve("data/lsengineers_diagrams.jsonl");
const OUT_DIR = path.resolve("data/eparts_assets/ls");
const CONCURRENCY = 5;
const DELAY_MS = 100;

interface LsDiagram {
  url: string;
  hero_image?: string;
}

function downloadFile(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (fs.existsSync(dest)) { resolve(true); return; }
    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    const req = proto.get(url, (res) => {
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, () => {}); resolve(false); return; }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(true); });
    });
    req.on("error", () => { file.close(); fs.unlink(dest, () => {}); resolve(false); });
    req.setTimeout(15000, () => { req.destroy(); resolve(false); });
  });
}

function slugFromUrl(imageUrl: string): string {
  return path.basename(imageUrl.split("?")[0]);
}

function componentCodeFromUrl(diagramUrl: string): string {
  return diagramUrl
    .replace("https://www.lsengineers.co.uk/", "")
    .replace(".html", "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });

  const lines = fs.readFileSync(DIAGRAMS_FILE, "utf8").split("\n").filter(Boolean);
  const diagrams: LsDiagram[] = lines.map(l => JSON.parse(l)).filter(d => d.hero_image);

  console.log(`Diagrams with hero_image: ${diagrams.length}`);

  if (DRY_RUN) {
    diagrams.slice(0, 5).forEach(d => console.log(`  ${componentCodeFromUrl(d.url)} → ${d.hero_image}`));
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.OEM_DIRECT_URL! }),
  });

  let downloaded = 0, skipped = 0, failed = 0, updated = 0;

  // Process in batches
  for (let i = 0; i < diagrams.length; i += CONCURRENCY) {
    const batch = diagrams.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (d) => {
      const imageUrl = d.hero_image!;
      const slug = slugFromUrl(imageUrl);
      const dest = path.join(OUT_DIR, slug);
      const imageKey = `ls/${slug}`;
      const componentCode = componentCodeFromUrl(d.url);

      const ok = await downloadFile(imageUrl, dest);
      if (!ok) { failed++; return; }
      if (fs.existsSync(dest)) downloaded++;

      // Update all Diagram rows with this componentCode
      const result = await prisma.diagram.updateMany({
        where: { componentCode },
        data: { diagramImageKey: imageKey },
      });
      if (result.count > 0) updated += result.count;
      else skipped++;
    }));

    if (i % 100 === 0) console.log(`  ${i}/${diagrams.length} processed...`);
    await sleep(DELAY_MS);
  }

  await prisma.$disconnect();

  console.log("\n=== Done ===");
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed:     ${failed}`);
  console.log(`DB rows updated: ${updated}`);
  console.log(`Skipped (no DB match): ${skipped}`);
}

main().catch(console.error);
