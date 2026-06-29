/**
 * 03-telehandlers.ts
 *
 * Ingests LS Engineers BOM data for Telehandlers.
 *
 * URL pattern: /assembly-for-wacker-{model}-telehandler.html
 * Serial-range slugs (e.g. th730-415-04) map to eParts displayName "TH730 (415-04)".
 * Simple slugs (th408, th412, th625…) map by modelName.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/lsengineers/03-telehandlers.ts [--dry-run]
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
  const m = url.match(/for-wacker-([a-z0-9-]+?)-telehandler\.html/i);
  return m ? m[1].toLowerCase() : null;
}

// Convert LS slug to eParts displayName
// "th730-415-04" → "TH730 (415-04)"
// "th408"        → "TH 408" (special case — eParts has space)
// "th412"        → "TH412"
function slugToDisplayName(slug: string): string {
  const upper = slug.toUpperCase();
  // Serial-range slug: THxxx-ddd-dd → "THxxx (ddd-dd)"
  const serial = upper.match(/^(TH\d+)-(\d{3}-\d{2})$/);
  if (serial) return `${serial[1]} (${serial[2]})`;
  // TH408 → "TH 408" (eParts uses a space)
  if (upper === "TH408") return "TH 408";
  return upper;
}

function slugToModelName(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "");
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  const lines = fs.readFileSync(DIAGRAMS_FILE, "utf8").split("\n").filter(Boolean);
  const allDiagrams: LsDiagram[] = lines.map(l => JSON.parse(l));

  const teleDiagrams = allDiagrams.filter(d =>
    d.breadcrumb[3] === "Telehandler Parts" && d.n_parts > 0
  );
  console.log(`Telehandler diagrams with parts: ${teleDiagrams.length}`);

  const byModel = new Map<string, LsDiagram[]>();
  for (const d of teleDiagrams) {
    const model = extractModel(d.url);
    if (!model) continue;
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model)!.push(d);
  }
  console.log(`Distinct telehandler models: ${byModel.size}`);

  if (DRY_RUN) {
    for (const [model, diags] of byModel) {
      console.log(`  ${model}: ${diags.length} diagrams → displayName: "${slugToDisplayName(model)}"`);
    }
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.OEM_DIRECT_URL! }),
  });

  let totalRevisions = 0, totalDiagrams = 0, totalParts = 0, totalLines = 0;
  const skippedModels: string[] = [];

  for (const [slug, diags] of byModel) {
    const displayName = slugToDisplayName(slug);
    const modelToken = slugToModelName(slug);

    // Try modelName first, then displayName
    let machines = await prisma.machine.findMany({
      where: { modelName: { in: [modelToken, slug.toUpperCase()], mode: "insensitive" } },
    });

    if (machines.length === 0) {
      machines = await prisma.machine.findMany({
        where: { displayName: { equals: displayName, mode: "insensitive" } },
      });
    }

    if (machines.length === 0) {
      console.log(`  [SKIP] ${slug} (${displayName}) — no matching Machine in DB`);
      skippedModels.push(slug);
      continue;
    }

    console.log(`\n${slug} → ${machines.length} machine(s): ${machines.map(m => m.displayName).join(", ")}`);

    for (const machine of machines) {
      const revision = await prisma.machineRevision.upsert({
        where: { machineId_revisionTag: { machineId: machine.id, revisionTag: "LS" } },
        create: {
          machineId: machine.id,
          revisionTag: "LS",
          mode: "NUMERIC",
          hasBom: true,
          rawName: `${machine.displayName} (Standard)`,
          bomSource: "LSENGINEERS",
        },
        update: { hasBom: true, bomSource: "LSENGINEERS" },
      });
      totalRevisions++;

      for (const [pos, lsDiag] of diags.entries()) {
        const componentCode = lsDiag.url
          .replace("https://www.lsengineers.co.uk/", "")
          .replace(".html", "");

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
                sources: { push: "LSENGINEERS" },
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
              create: { diagramId: diagram.id, partId: part.id, callout, qty: p.qty ?? 1 },
              update: {},
            });
            totalLines++;
          } catch {
            // duplicate — skip
          }
        }
      }

      console.log(`  rev=LS: ${diags.length} diagrams`);
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
