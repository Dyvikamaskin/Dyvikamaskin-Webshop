/**
 * 01-excavators.ts
 *
 * Ingests LS Engineers BOM data for excavators into the local OEM DB.
 *
 * Logic:
 *  - Reads lsengineers_diagrams.jsonl, filters for excavator breadcrumbs
 *  - Groups diagrams by model slug (e.g. "et145", "ez26")
 *  - For models with engine-variant codes in assembly names (e.g. 904J-E36TA):
 *      → creates one MachineRevision per engine variant
 *      → shared diagrams (no engine code) are attached to ALL variants
 *  - For models with no engine variants:
 *      → creates one MachineRevision tagged "LS"
 *  - Matches model slug → Machine rows in DB by modelName (case-insensitive)
 *  - All matching Machine codes get the revision attached
 *  - Upserts Part rows (adds LSENGINEERS to sources[])
 *  - Inserts PartLine rows (skips duplicates)
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/lsengineers/01-excavators.ts [--dry-run]
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import * as fs from "fs";
import * as path from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const DIAGRAMS_FILE = path.resolve("data/lsengineers_diagrams.jsonl");

// Engine code pattern in assembly slug: e.g. 904j-e36ta, 845f-e34tawf, 404f-e22ta
const ENGINE_CODE_RE = /([a-z0-9]{3,5}-[a-z][0-9]{2,4}[a-z]{0,4}[wf]{0,2})-assembly-for-wacker/i;

interface LsDiagram {
  url: string;
  title: string;
  breadcrumb: string[];
  n_parts: number;
  parts: Array<{
    ref: number;
    index: number;
    sku: string;
    name: string;
    price_amount?: string;
    lead_time?: string;
    qty?: number;
  }>;
}

function extractModel(url: string): string | null {
  const m = url.match(/for-wacker-([a-z0-9-]+?)(-mini-excavator|-zero-tail-excavator|-conventional-tail-excavator|-wheeled-excavator|-excavator|\.html)/i);
  return m ? m[1].toLowerCase() : null;
}

function extractEngineCode(url: string): string | null {
  const m = url.match(ENGINE_CODE_RE);
  return m ? m[1].toUpperCase() : null;
}

// Normalise model slug → DB modelName token (uppercase, no separators)
function slugToModelName(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "");
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // ── Load LS diagrams ───────────────────────────────────────────────────────
  const lines = fs.readFileSync(DIAGRAMS_FILE, "utf8").split("\n").filter(Boolean);
  const allDiagrams: LsDiagram[] = lines.map(l => JSON.parse(l));

  const excavDiagrams = allDiagrams.filter(d =>
    d.breadcrumb.some(b => /excavat/i.test(b)) && d.n_parts > 0
  );
  console.log(`Excavator diagrams with parts: ${excavDiagrams.length}`);

  // Group by model slug
  const byModel = new Map<string, LsDiagram[]>();
  for (const d of excavDiagrams) {
    const model = extractModel(d.url);
    if (!model) continue;
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model)!.push(d);
  }
  console.log(`Distinct excavator models: ${byModel.size}`);

  if (DRY_RUN) {
    for (const [model, diags] of byModel) {
      const engineCodes = [...new Set(diags.map(d => extractEngineCode(d.url)).filter(Boolean))];
      console.log(`  ${model}: ${diags.length} diagrams, engine codes: [${engineCodes.join(", ") || "none"}]`);
    }
    return;
  }

  // ── Connect to DB ──────────────────────────────────────────────────────────
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.OEM_DIRECT_URL! }),
  });

  let totalRevisions = 0, totalDiagrams = 0, totalParts = 0, totalLines = 0;
  const skippedModels: string[] = [];

  for (const [slug, diags] of byModel) {
    // Find matching machines in DB — try modelName (stripped + hyphenated) then displayName fallback
    const modelToken = slugToModelName(slug);
    const modelTokenHyphen = slug.toUpperCase(); // preserves hyphens
    let machines = await prisma.machine.findMany({
      where: {
        modelName: { in: [modelToken, modelTokenHyphen], mode: "insensitive" },
      },
    });
    if (machines.length === 0) {
      // Fallback: match on displayName (e.g. 75Z3 has modelName="WN", displayName="75Z3")
      machines = await prisma.machine.findMany({
        where: {
          displayName: { in: [modelToken, modelTokenHyphen], mode: "insensitive" },
        },
      });
    }

    // Special case: 6003-8003 slug covers two models
    let extraMachines: typeof machines = [];
    if (slug === "6003-8003") {
      extraMachines = await prisma.machine.findMany({
        where: { modelName: { in: ["6003", "8003"], mode: "insensitive" }, source: "EPARTS_API" },
      });
    }
    const allMachines = [...machines, ...extraMachines];

    if (allMachines.length === 0) {
      console.log(`  [SKIP] ${slug} — no matching Machine in DB`);
      skippedModels.push(slug);
      continue;
    }

    console.log(`\n${slug} → ${allMachines.length} machine(s): ${allMachines.map(m => m.code).join(", ")}`);

    // Identify engine variants
    const engineCodes = [...new Set(diags.map(d => extractEngineCode(d.url)).filter((c): c is string => !!c))];
    const hasVariants = engineCodes.length > 0;

    // Build revision tags
    // If variants exist: one revision per engine code + attach shared to all
    // If no variants: single "LS" revision
    const revisionTags = hasVariants ? engineCodes : ["LS"];

    for (const machine of allMachines) {
      for (const revTag of revisionTags) {
        const revision = await prisma.machineRevision.upsert({
          where: { machineId_revisionTag: { machineId: machine.id, revisionTag: revTag } },
          create: {
            machineId: machine.id,
            revisionTag: revTag,
            mode: hasVariants ? "SERIAL_RANGE" : "NUMERIC",
            hasBom: true,
            rawName: hasVariants ? `${modelToken} (${revTag})` : `${modelToken} (Standard)`,
            bomSource: "LSENGINEERS",
          },
          update: { hasBom: true, bomSource: "LSENGINEERS" },
        });
        totalRevisions++;

        // Diagrams for this revision:
        // - engine-specific: only those matching this engine code
        // - shared: those with no engine code (attach to all revisions)
        const revDiagrams = hasVariants
          ? diags.filter(d => {
              const code = extractEngineCode(d.url);
              return code === revTag || code === null;
            })
          : diags;

        for (const [pos, lsDiag] of revDiagrams.entries()) {
          // Use URL slug as componentCode for idempotency
          const componentCode = lsDiag.url.replace("https://www.lsengineers.co.uk/", "").replace(".html", "");

          const diagram = await prisma.diagram.upsert({
            where: { revisionId_componentCode: { revisionId: revision.id, componentCode } },
            create: {
              revisionId: revision.id,
              position: pos + 1,
              name: lsDiag.title,
              componentCode,
            },
            update: { name: lsDiag.title },
          });
          totalDiagrams++;

          for (const p of lsDiag.parts) {
            if (!p.sku?.trim()) continue;
            const partNumber = p.sku.trim();

            // Upsert Part
            let part: { id: string };
            try {
              part = await prisma.part.upsert({
                where: { partNumber },
                create: {
                  partNumber,
                  name: p.name || partNumber,
                  sources: ["LSENGINEERS"],
                  aliases: [],
                },
                update: {
                  // Add LSENGINEERS to sources if not already there
                  sources: { push: "LSENGINEERS" },
                  // Update name only if currently just the part number
                  name: p.name || partNumber,
                },
              });
            } catch {
              const existing = await prisma.part.findUnique({ where: { partNumber } });
              if (!existing) continue;
              part = existing;
            }
            totalParts++;

            const callout = String(p.ref ?? "");
            try {
              await prisma.partLine.upsert({
                where: { diagramId_partId_callout: { diagramId: diagram.id, partId: part.id, callout } },
                create: {
                  diagramId: diagram.id,
                  partId: part.id,
                  callout,
                  qty: p.qty ?? 1,
                },
                update: {},
              });
              totalLines++;
            } catch {
              // duplicate — skip
            }
          }
        }

        console.log(`  rev=${revTag}: ${revDiagrams.length} diagrams`);
      }
    }
  }

  await prisma.$disconnect();

  console.log("\n=== Done ===");
  console.log(`Revisions written:  ${totalRevisions}`);
  console.log(`Diagrams written:   ${totalDiagrams}`);
  console.log(`Part upserts:       ${totalParts}`);
  console.log(`PartLines written:  ${totalLines}`);
  if (skippedModels.length) console.log(`Skipped models:     ${skippedModels.join(", ")}`);
}

main().catch(console.error);
