/**
 * 02-manual-gap-fill.ts
 *
 * Backfills partsManualUrl / partsManualFilename / operatingManuals for
 * MachineRevision rows that are missing this data because they were created
 * by the BOM walk rather than the catalog sync.
 *
 * Two passes:
 *
 *   Pass A — 5xxx machines with no JSON file in data/eparts_v2/
 *             Calls GET /ws/v2/amd/navigation/products/{code} to get the
 *             revisions array (same as catalog sync), writes the JSON file,
 *             then upserts MachineRevision rows.
 *
 *   Pass B — 1xxx big-equipment machines
 *             Calls GET /ws/v2/amd/navigation/nonRevMachine/{code} to get
 *             sparepartsBookList[].partsManuals[], upserts into MachineRevision.
 *
 * Idempotent — skips machines where all their revisions already have
 * partsManualUrl populated. Saves progress to data/eparts_v2/_gap_fill_progress.json.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/eparts/02-manual-gap-fill.ts
 *   npx tsx scripts/oem-ingest/eparts/02-manual-gap-fill.ts --pass a
 *   npx tsx scripts/oem-ingest/eparts/02-manual-gap-fill.ts --pass b
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import * as fs from "fs";
import * as path from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.OEM_DIRECT_URL! }),
});

const BASE = "https://shop.wackerneuson.com/ws/v2/amd/navigation";
const EPARTS_DIR = path.join(process.cwd(), "data", "eparts_v2");
const PROGRESS_FILE = path.join(EPARTS_DIR, "_gap_fill_progress.json");
const SIDEBAR_FILE = path.join(EPARTS_DIR, "_sidebar_4412.json");
const CONCURRENCY = 5;
const DELAY_MS = 300;

const passArg = process.argv.includes("--pass")
  ? process.argv[process.argv.indexOf("--pass") + 1].toLowerCase()
  : "ab";

// ── Progress ──────────────────────────────────────────────────────────────────

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

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "Accept-Language": "en_US" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

// ── Pass A: 5xxx machines missing JSON ───────────────────────────────────────

async function passA(progress: Progress) {
  console.log("\n[Pass A] Fetch revision+manual data for 5xxx machines missing JSON file");

  const sidebar = JSON.parse(fs.readFileSync(SIDEBAR_FILE, "utf8"));
  const machines: Array<{ code: string; name: string }> = sidebar.machines;

  const fiveXxx = machines.filter(
    (m) =>
      m.code.startsWith("5") &&
      !fs.existsSync(path.join(EPARTS_DIR, `${m.code}.json`)) &&
      !progress.done.includes(m.code) &&
      !progress.errors.includes(m.code)
  );

  console.log(`  ${fiveXxx.length} machines to fetch (of ${machines.filter(m => m.code.startsWith("5")).length} 5xxx total)`);

  let done = 0;
  await runConcurrently(fiveXxx, async (m) => {
    try {
      const data = await fetchJson(`${BASE}/products/${m.code}?lang=en_US&mode=unrestricted`);
      // Save JSON file for catalog sync compatibility
      fs.writeFileSync(
        path.join(EPARTS_DIR, `${m.code}.json`),
        JSON.stringify({ ...data, code: m.code }, null, 2)
      );

      // Upsert revisions into DB
      const revisions: any[] = data.revisions ?? [];
      const machine = await prisma.machine.findFirst({
        where: { code: m.code, source: "EPARTS_API" },
        select: { id: true },
      });
      if (!machine) {
        progress.errors.push(m.code);
        saveProgress(progress);
        return;
      }

      for (const rev of revisions) {
        if (!rev.name) continue;
        const pm = rev.partsManuals?.[0];
        const existingRev = await prisma.machineRevision.findUnique({
          where: { machineId_revisionTag: { machineId: machine.id, revisionTag: rev.name } },
        });
        if (existingRev) {
          // Only update if fields are null
          if (!existingRev.partsManualUrl && pm?.url) {
            await prisma.machineRevision.update({
              where: { machineId_revisionTag: { machineId: machine.id, revisionTag: rev.name } },
              data: {
                partsManualUrl: pm.url,
                partsManualFilename: pm.filename ?? null,
                operatingManuals: rev.operatingManuals ? JSON.stringify(rev.operatingManuals) : undefined,
                hasBom: rev.hasBomTree ?? existingRev.hasBom,
                imageUrl: rev.imageUrl ?? existingRev.imageUrl,
              },
            });
          }
        }
      }

      progress.done.push(m.code);
      done++;
      saveProgress(progress);
      process.stdout.write(`\r  Pass A: ${done}/${fiveXxx.length} done, ${progress.errors.length} errors`);
      await sleep(DELAY_MS);
    } catch (e: any) {
      process.stderr.write(`\n  Error ${m.code}: ${e.message}\n`);
      progress.errors.push(m.code);
      saveProgress(progress);
    }
  }, CONCURRENCY);

  console.log(`\n  Pass A complete: ${done} fetched`);
}

// ── Pass B: 1xxx big-equipment ────────────────────────────────────────────────

async function passB(progress: Progress) {
  console.log("\n[Pass B] Fetch parts manual data for 1xxx big-equipment machines");

  const sidebar = JSON.parse(fs.readFileSync(SIDEBAR_FILE, "utf8"));
  const machines: Array<{ code: string; name: string }> = sidebar.machines;

  const oneXxx = machines.filter(
    (m) =>
      m.code.startsWith("1") &&
      !progress.done.includes(m.code) &&
      !progress.errors.includes(m.code)
  );

  console.log(`  ${oneXxx.length} big-equipment machines to process`);

  let done = 0;
  await runConcurrently(oneXxx, async (m) => {
    try {
      const data = await fetchJson(`${BASE}/nonRevMachine/${m.code}?lang=en_US&mode=unrestricted`);
      const books: any[] = data.sparepartsBookList ?? [];

      const machine = await prisma.machine.findFirst({
        where: { code: m.code, source: "EPARTS_API" },
        select: { id: true },
      });
      if (!machine) {
        progress.errors.push(m.code);
        saveProgress(progress);
        return;
      }

      for (const book of books) {
        if (!book.sparePartListCode || book.isAccessory) continue;
        const revisionTag = book.sparePartListCode;
        const pm = book.partsManuals?.[0];

        const existingRev = await prisma.machineRevision.findUnique({
          where: { machineId_revisionTag: { machineId: machine.id, revisionTag } },
        });

        if (existingRev) {
          if (!existingRev.partsManualUrl && pm?.url) {
            await prisma.machineRevision.update({
              where: { machineId_revisionTag: { machineId: machine.id, revisionTag } },
              data: {
                partsManualUrl: pm.url,
                partsManualFilename: pm.filename ?? null,
                operatingManuals: book.operatingManuals ? JSON.stringify(book.operatingManuals) : undefined,
              },
            });
          }
        } else {
          // Create if missing — 1xxx revisions use serial-range mode
          await prisma.machineRevision.create({
            data: {
              machineId: machine.id,
              revisionTag,
              mode: "SERIAL_RANGE",
              sparePartListCode: book.sparePartListCode,
              hasBom: false,
              afCode: book.afCode ?? null,
              aiCode: book.aiCode ?? null,
              serialFrom: book.wncFrom ?? null,
              serialTo: book.wncTo ?? null,
              rawName: book.rawName ?? null,
              imageUrl: book.imageUrl ?? null,
              partsManualUrl: pm?.url ?? null,
              partsManualFilename: pm?.filename ?? null,
              operatingManuals: book.operatingManuals ? JSON.stringify(book.operatingManuals) : undefined,
            },
          });
        }
      }

      progress.done.push(m.code);
      done++;
      saveProgress(progress);
      process.stdout.write(`\r  Pass B: ${done}/${oneXxx.length} done, ${progress.errors.length} errors`);
      await sleep(DELAY_MS);
    } catch (e: any) {
      process.stderr.write(`\n  Error ${m.code}: ${e.message}\n`);
      progress.errors.push(m.code);
      saveProgress(progress);
    }
  }, CONCURRENCY);

  console.log(`\n  Pass B complete: ${done} fetched`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const progress = loadProgress();
  console.log(`Progress: ${progress.done.length} done, ${progress.errors.length} errors`);

  if (passArg.includes("a")) await passA(progress);
  if (passArg.includes("b")) await passB(progress);

  console.log("\n=== Gap fill complete ===");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
