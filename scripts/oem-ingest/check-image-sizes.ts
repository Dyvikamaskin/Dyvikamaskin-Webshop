import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/app/generated/oem-prisma/client.ts";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });

async function main() {
  // Unique image keys per source
  const dbStats = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      r."bomSource"::text                                             AS source,
      COUNT(d.id)::int                                               AS total_diagrams,
      COUNT(DISTINCT d."diagramImageKey")
        FILTER (WHERE d."diagramImageKey" IS NOT NULL)::int          AS unique_image_keys,
      COUNT(d.id)
        FILTER (WHERE d."diagramImageKey" IS NOT NULL)::int          AS diagrams_with_image
    FROM "Diagram" d
    JOIN "MachineRevision" r ON r.id = d."revisionId"
    GROUP BY r."bomSource"::text
    ORDER BY total_diagrams DESC
  `);

  console.log("DB — unique image keys per source:");
  for (const r of dbStats) {
    const coverage = r.diagrams_with_image > 0
      ? ((r.unique_image_keys / r.diagrams_with_image) * 100).toFixed(1)
      : "0";
    console.log(`  ${r.source}: ${r.total_diagrams} diagrams, ${r.unique_image_keys} unique images (${coverage}% of images-present diagrams are unique keys)`);
  }

  // File sizes on disk
  const dirs = [
    { label: "eParts PNGs",       dir: "data/eparts_assets",           ext: ".png" },
    { label: "Weidemann SVGZs",   dir: "data/weidemann_assets/weidemann", ext: ".svgz" },
    { label: "LS Engineers",      dir: "data/lsengineers_assets",       ext: "" },
  ];

  console.log("\nDisk — file sizes:");
  for (const { label, dir, ext } of dirs) {
    const full = path.resolve(dir);
    if (!fs.existsSync(full)) { console.log(`  ${label}: directory not found`); continue; }
    let count = 0, bytes = 0;
    for (const f of fs.readdirSync(full)) {
      if (ext && !f.endsWith(ext)) continue;
      try {
        const stat = fs.statSync(path.join(full, f));
        if (stat.isFile()) { count++; bytes += stat.size; }
      } catch {}
    }
    console.log(`  ${label}: ${count} files, ${(bytes / 1024 / 1024).toFixed(0)} MB`);
  }

  // How much of the eParts disk footprint is genuinely unique?
  // Count files on disk vs unique keys in DB
  const epartsDir = path.resolve("data/eparts_assets");
  const onDisk = new Set(fs.readdirSync(epartsDir).filter(f => f.endsWith(".png")));
  const inDb = await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT "diagramImageKey" FROM "Diagram"
    WHERE "diagramImageKey" IS NOT NULL
      AND "diagramImageKey" LIKE '%.png'
  `);
  const referencedKeys = new Set(inDb.map((r: any) => r.diagramImageKey));

  const onDiskNotInDb = [...onDisk].filter(f => !referencedKeys.has(f)).length;
  const inDbNotOnDisk = [...referencedKeys].filter(k => !onDisk.has(k)).length;

  // Compute size of unreferenced files
  let orphanBytes = 0;
  for (const f of onDisk) {
    if (!referencedKeys.has(f)) {
      try { orphanBytes += fs.statSync(path.join(epartsDir, f)).size; } catch {}
    }
  }

  console.log(`\neParts image reconciliation:`);
  console.log(`  On disk:                 ${onDisk.size} files`);
  console.log(`  Referenced in DB:        ${referencedKeys.size} unique keys`);
  console.log(`  On disk, not in DB:      ${onDiskNotInDb} files (${(orphanBytes/1024/1024).toFixed(0)} MB orphans)`);
  console.log(`  In DB, not on disk:      ${inDbNotOnDisk} keys (missing downloads)`);
}
main().finally(() => prisma.$disconnect());
