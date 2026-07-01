/**
 * 03-bom-walk.ts
 *
 * Walks the eParts API for all 4,412 sidebar machines and writes
 * Machine → MachineRevision → Diagram → Part → PartLine into the
 * local OEM database.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/eparts/03-bom-walk.ts
 *   npx tsx scripts/oem-ingest/eparts/03-bom-walk.ts --category "Compaction"
 *   npx tsx scripts/oem-ingest/eparts/03-bom-walk.ts --limit 50
 *
 * Idempotent: machines already in DB with diagrams are skipped.
 * Safe to stop and resume — pick up where it left off.
 */

import { config } from "dotenv";
config();                                  // load .env
config({ path: ".env.local", override: true }); // .env.local wins (mirrors Next.js behaviour)
import https from "https";
import fs from "fs";
import path from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE = "https://shop.wackerneuson.com/ws/v2/amd";
const CONCURRENCY = 5; // machines in parallel
const COMPONENT_DELAY_MS = 50; // delay between component fetches per machine
const SIDEBAR_FILE = path.resolve(
  "data/eparts_v2/_sidebar_4412.json"
);
const PROGRESS_FILE = path.resolve(
  "data/eparts_v2/_bom_walk_progress.json"
);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const categoryFilter = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;
const limitArg = args.includes("--limit")
  ? parseInt(args[args.indexOf("--limit") + 1])
  : null;
const sidebarArg = args.includes("--sidebar")
  ? args[args.indexOf("--sidebar") + 1]
  : null;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
function get<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

const sleep = (ms: number) =>
  new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// eParts API types
// ---------------------------------------------------------------------------
interface Device {
  name: string;
  code: string;
  position: string;
  revision: string;
  revisionLevel: string;
  subProductCode: string;
}

interface Revision {
  name: string;
  devices: Device[];
}

interface ProductResponse {
  code: string;
  name: string;
  revisions?: Revision[];
}

interface ComponentPart {
  diagramCalloutNumber: string;
  diagramQuantity: string;
  partName: string;
  partNumber: string;
  unitOfMeasure: string;
}

interface DiagramCoordinate {
  calloutId: string;
  x1: number; y1: number; x2: number; y2: number;
}

interface ComponentResponse {
  code: string;
  componentParts: ComponentPart[];
  diagramData?: {
    diagramImage?: string;
    diagramCoordinates?: DiagramCoordinate[];
  };
  revision?: string;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------
interface Progress {
  done: string[];
  errors: Record<string, string>;
  startedAt: string;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return { done: [], errors: {}, startedAt: new Date().toISOString() };
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---------------------------------------------------------------------------
// Main walk logic for one machine
// ---------------------------------------------------------------------------
async function walkMachine(
  prisma: PrismaClient,
  code: string,
  topCategory: string,
  machineName: string
): Promise<{ diagrams: number; parts: number }> {
  // Upsert Machine row
  const machine = await prisma.machine.upsert({
    where: { code_source: { code, source: "EPARTS_API" } },
    create: {
      code,
      source: "EPARTS_API",
      displayName: machineName.replace(/_\d+$/, "").trim(),
      modelName: machineName.split("_")[0].trim(),
      categoryPath: [topCategory],
    },
    update: {
      displayName: machineName.replace(/_\d+$/, "").trim(),
      categoryPath: [topCategory],
    },
  });

  // Fetch product data (revisions + devices)
  const product = await get<ProductResponse>(
    `${BASE}/navigation/products/${code}`
  );
  if (!product?.revisions?.length) return { diagrams: 0, parts: 0 };

  let totalDiagrams = 0;
  let totalParts = 0;

  for (const rev of product.revisions) {
    if (!rev.devices?.length) continue;

    // Upsert MachineRevision
    const revision = await prisma.machineRevision.upsert({
      where: {
        machineId_revisionTag: {
          machineId: machine.id,
          revisionTag: rev.name,
        },
      },
      create: {
        machineId: machine.id,
        revisionTag: rev.name,
        mode: "NUMERIC",
        hasBom: true,
        rawName: rev.name,
        bomSource: "EPARTS_API",
      },
      update: { hasBom: true, bomSource: "EPARTS_API" },
    });

    // Walk each component (diagram)
    for (const [pos, device] of rev.devices.entries()) {
      const compUrl =
        `${BASE}/navigation/components/machine/${code}` +
        `/revision/${device.revision}/component/${device.subProductCode}` +
        `?lang=en_US&mode=unrestricted`;

      const comp = await get<ComponentResponse>(compUrl);
      await sleep(COMPONENT_DELAY_MS);

      if (!comp?.componentParts?.length) continue;

      // diagramImage / diagramCoordinates come back as { filename, id } refs — not inline data.
      // Store filename as the image key, full diagramData blob in hotspotsJson for later re-fetch.
      const imgRef = comp.diagramData?.diagramImage as any;
      const imageKey = typeof imgRef === "string" ? imgRef : (imgRef?.filename ?? null);
      const imageSourceId = imgRef?.id ? String(imgRef.id) : null;

      // Upsert Diagram
      const diagram = await prisma.diagram.upsert({
        where: {
          revisionId_componentCode: {
            revisionId: revision.id,
            componentCode: device.subProductCode,
          },
        },
        create: {
          revisionId: revision.id,
          position: pos + 1,
          name: device.name,
          componentCode: device.subProductCode,
          diagramImageKey: imageKey,
          diagramImageSourceId: imageSourceId,
          hotspotsJson: comp.diagramData ?? null,
        },
        update: {
          name: device.name,
          diagramImageKey: imageKey,
          diagramImageSourceId: imageSourceId,
          hotspotsJson: comp.diagramData ?? null,
        },
      });

      totalDiagrams++;

      // Upsert Parts + PartLines
      for (const p of comp.componentParts) {
        if (!p.partNumber) continue;

        let part: { id: string };
        try {
          part = await prisma.part.upsert({
            where: { partNumber: p.partNumber },
            create: {
              partNumber: p.partNumber,
              name: p.partName || p.partNumber,
              aliases: [],
            },
            update: {},
          });
        } catch (e: any) {
          // P2002: concurrent INSERT from another machine in the same batch
          if (e?.code === "P2002") {
            const existing = await prisma.part.findUnique({
              where: { partNumber: p.partNumber },
            });
            if (!existing) continue;
            part = existing;
          } else {
            throw e;
          }
        }

        const callout = p.diagramCalloutNumber ?? "";
        try {
          await prisma.partLine.upsert({
            where: {
              diagramId_partId_callout: {
                diagramId: diagram.id,
                partId: part.id,
                callout,
              },
            },
            create: {
              diagramId: diagram.id,
              partId: part.id,
              callout,
              qty: p.diagramQuantity ? parseInt(p.diagramQuantity) || 1 : 1,
              notes: null,
              isRecommended: false,
            },
            update: {},
          });
        } catch (e: any) {
          if (e?.code !== "P2002") throw e;
          // duplicate (diagramId, partId, callout) — already written, skip
        }

        totalParts++;
      }
    }
  }

  return { diagrams: totalDiagrams, parts: totalParts };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  const sidebarPath = sidebarArg ? path.resolve(sidebarArg) : SIDEBAR_FILE;
  const sidebar = JSON.parse(fs.readFileSync(sidebarPath, "utf8")) as {
    machines: { code: string; name: string; topCategory: string }[];
  };

  let machines = sidebar.machines;

  if (categoryFilter) {
    machines = machines.filter((m) =>
      m.topCategory.toLowerCase().includes(categoryFilter.toLowerCase())
    );
    console.log(
      `Filtered to category "${categoryFilter}": ${machines.length} machines`
    );
  }

  if (limitArg) {
    machines = machines.slice(0, limitArg);
    console.log(`Limited to first ${limitArg} machines`);
  }

  const progress = loadProgress();
  const doneSet = new Set(progress.done);

  const pending = machines.filter((m) => !doneSet.has(m.code));
  console.log(
    `Total: ${machines.length} | Already done: ${doneSet.size} | Pending: ${pending.length}`
  );

  if (!pending.length) {
    console.log("Nothing to do — all machines already walked.");
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.OEM_DIRECT_URL! }),
  });

  let done = 0;
  let totalDiagrams = 0;
  let totalParts = 0;
  const startTime = Date.now();

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (m) => {
        try {
          const result = await walkMachine(
            prisma,
            m.code,
            m.topCategory,
            m.name ?? m.code
          );
          progress.done.push(m.code);
          totalDiagrams += result.diagrams;
          totalParts += result.parts;
        } catch (err: any) {
          progress.errors[m.code] = err?.message ?? String(err);
          console.error(`  ERROR ${m.code}: ${err?.message}`);
        }
      })
    );

    done += batch.length;
    saveProgress(progress);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = done / elapsed;
    const eta = Math.round((pending.length - done) / rate);
    console.log(
      `${done}/${pending.length} | ` +
        `diagrams: ${totalDiagrams} | parts: ${totalParts} | ` +
        `ETA: ${Math.floor(eta / 60)}m${eta % 60}s`
    );
  }

  await prisma.$disconnect();

  console.log("\n=== Walk complete ===");
  console.log(`Machines processed: ${done}`);
  console.log(`Diagrams written:   ${totalDiagrams}`);
  console.log(`Parts written:      ${totalParts}`);
  console.log(`Errors:             ${Object.keys(progress.errors).length}`);
  if (Object.keys(progress.errors).length > 0) {
    console.log("Error codes:", Object.keys(progress.errors).join(", "));
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
