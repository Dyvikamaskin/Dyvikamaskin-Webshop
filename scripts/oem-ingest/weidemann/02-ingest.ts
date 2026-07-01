/**
 * 02-ingest.ts
 *
 * Ingests the Weidemann eService BOM walk (01-bom-walk.ts output) into the
 * local OEM DB. Reads ONLY `data/weidemann_raw/*__*.jsonl` (double-underscore =
 * the corrected walk; old single-underscore files are broken and ignored).
 *
 * Mapping (Weidemann nested tree → flat OEM schema):
 *   file                       → Machine (one per model) + one MachineRevision
 *   tree node WITH parts        → Diagram (componentCode = node id within catalog)
 *     node.parts[]              → Part (cached, deduped) + PartLine
 *   nested grouping             → Diagram.subRevisionName = ancestor path
 *
 * Machine identity:
 *   code        = `${catalog}#${assemblyId}`   (stable, collision-proof)
 *   displayName = machine name (e.g. "1230CX30", "1140 >Serial No.: 3018101")
 *   modelName   = normalized base token (serial suffix stripped → "1140")
 *   categoryPath= ["Weidemann", catalog]
 *
 * Performance: Parts are heavily shared across diagrams/machines, so a process-
 * wide Map<partNumber,id> means each unique part is touched once; PartLines go
 * in via createMany(skipDuplicates). Machines processed sequentially (no races).
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/weidemann/02-ingest.ts [--dry-run] [--limit=N] [--catalog=NAME]
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import * as fs from "fs";
import * as path from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1]) : Infinity;
})();
const CATALOG_FILTER = (() => {
  const a = process.argv.find((x) => x.startsWith("--catalog="));
  return a ? a.split("=")[1] : null;
})();

const RAW_DIR = path.resolve("data/weidemann_raw");

// ── Weidemann tree types (01-bom-walk.ts output) ───────────────────────────────
interface WeidPart {
  callout: string;
  partNumber: string;
  description: string;
  notes: string;
  qty: string;
  unit: string;
}
interface WeidAssembly {
  id: number;
  name: string;
  parts: WeidPart[];
  subAssemblies: WeidAssembly[];
}
interface WeidFile {
  catalog: string;
  machine: string;
  assemblyId: number;
  tree: WeidAssembly;
}

// Normalised model token: drop serial-range suffix, lowercase, strip separators.
//   "1140 >Serial No.: 3018101" → "1140"
//   "1230 CX35"                 → "1230cx35"
function normalizeModel(name: string): string {
  const base = name.split(/[<>]|serial\s*no/i)[0];
  return base.toLowerCase().replace(/[^a-z0-9]/g, "") || name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Flatten the nested tree into diagram records. Every node carrying its own
// parts becomes a diagram; the chain of ancestor group names (excluding the
// root model and the node itself) is kept as subRevisionName for context.
type FlatDiagram = {
  nodeId: number;
  name: string;
  subRevisionName: string | null;
  position: number;
  parts: WeidPart[];
};
function flatten(root: WeidAssembly): FlatDiagram[] {
  const out: FlatDiagram[] = [];
  let pos = 0;
  const walk = (node: WeidAssembly, ancestors: string[]) => {
    if (node.parts.length > 0) {
      out.push({
        nodeId: node.id,
        name: node.name || `assembly ${node.id}`,
        subRevisionName: ancestors.length ? ancestors.join(" / ") : null,
        position: pos++,
        parts: node.parts,
      });
    }
    for (const child of node.subAssemblies) {
      walk(child, node.name ? [...ancestors, node.name] : ancestors);
    }
  };
  // Root model name itself is not an ancestor label.
  for (const child of root.subAssemblies) walk(child, []);
  if (root.parts.length > 0) {
    out.push({ nodeId: root.id, name: root.name || `assembly ${root.id}`, subRevisionName: null, position: pos++, parts: root.parts });
  }
  return out;
}

function parseQty(q: string): number | null {
  const n = parseInt((q || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  let files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.includes("__") && f.endsWith(".jsonl"))
    .sort();
  if (CATALOG_FILTER) files = files.filter((f) => f.startsWith(`${CATALOG_FILTER}__`));
  files = files.slice(0, LIMIT);
  console.log(`Weidemann model files: ${files.length}`);

  // Quick dry-run summary
  if (DRY_RUN) {
    let totDiag = 0, totLines = 0;
    const uniqueParts = new Set<string>();
    for (const f of files) {
      const data: WeidFile = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
      const diagrams = flatten(data.tree);
      totDiag += diagrams.length;
      for (const d of diagrams)
        for (const p of d.parts) {
          if (p.partNumber?.trim()) { totLines++; uniqueParts.add(p.partNumber.trim()); }
        }
    }
    console.log(`Would write: ${files.length} machines, ${totDiag} diagrams, ${totLines} part-lines, ${uniqueParts.size} unique parts`);
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }),
  });

  // Safety: confirm we're pointed at the local DB, not Supabase.
  const url = process.env.OEM_DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error(`Refusing to run: OEM_DATABASE_URL is not local (${url.replace(/:[^:@]+@/, ":***@")}).`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Process-wide part cache: partNumber → part id.
  const partCache = new Map<string, string>();
  async function getPartId(partNumber: string, name: string, unit: string): Promise<string> {
    const cached = partCache.get(partNumber);
    if (cached) return cached;
    let part = await prisma.part.findUnique({
      where: { partNumber },
      select: { id: true, sources: true, name: true },
    });
    if (!part) {
      try {
        const created = await prisma.part.create({
          data: {
            partNumber,
            name: name || partNumber,
            unitOfMeasure: unit || null,
            sources: ["WEIDEMANN_ESERVICE"],
            aliases: [],
          },
          select: { id: true },
        });
        partCache.set(partNumber, created.id);
        return created.id;
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
        part = await prisma.part.findUnique({ where: { partNumber }, select: { id: true, sources: true, name: true } });
        if (!part) throw e;
      }
    }
    // Existing part — add our source if missing.
    if (!part.sources.includes("WEIDEMANN_ESERVICE")) {
      await prisma.part.update({
        where: { partNumber },
        data: { sources: { push: "WEIDEMANN_ESERVICE" }, name: part.name || name || partNumber },
      });
    }
    partCache.set(partNumber, part.id);
    return part.id;
  }

  let nMachines = 0, nDiagrams = 0, nLines = 0;
  const t0 = Date.now();

  for (const f of files) {
    const data: WeidFile = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
    const code = `${data.catalog}#${data.assemblyId}`;

    const machine = await prisma.machine.upsert({
      where: { code_source: { code, source: "WEIDEMANN_ESERVICE" } },
      create: {
        code,
        source: "WEIDEMANN_ESERVICE",
        displayName: data.machine,
        modelName: normalizeModel(data.machine),
        categoryPath: ["Weidemann", data.catalog],
        summary: `[Weidemann eService: ${data.catalog}]`,
      },
      update: { displayName: data.machine, modelName: normalizeModel(data.machine) },
      select: { id: true },
    });

    const revision = await prisma.machineRevision.upsert({
      where: { machineId_revisionTag: { machineId: machine.id, revisionTag: "WEIDEMANN" } },
      create: {
        machineId: machine.id,
        revisionTag: "WEIDEMANN",
        mode: "SERIAL_RANGE",
        hasBom: true,
        bomSource: "WEIDEMANN_ESERVICE",
        rawName: data.machine,
      },
      update: { hasBom: true, bomSource: "WEIDEMANN_ESERVICE" },
      select: { id: true },
    });

    const diagrams = flatten(data.tree);
    let machineLines = 0;
    for (const d of diagrams) {
      const componentCode = String(d.nodeId);
      const diagram = await prisma.diagram.upsert({
        where: { revisionId_componentCode: { revisionId: revision.id, componentCode } },
        create: {
          revisionId: revision.id,
          position: d.position,
          name: d.name,
          componentCode,
          subRevisionName: d.subRevisionName,
        },
        update: { name: d.name, subRevisionName: d.subRevisionName, position: d.position },
        select: { id: true },
      });
      nDiagrams++;

      // Build part-lines, deduping (partId, callout) within the diagram.
      const seen = new Set<string>();
      const lineData: { diagramId: string; partId: string; callout: string; qty: number | null; notes: string | null }[] = [];
      for (const p of d.parts) {
        const partNumber = p.partNumber?.trim();
        if (!partNumber) continue;
        const partId = await getPartId(partNumber, p.description?.trim(), p.unit?.trim());
        const callout = (p.callout ?? "").trim();
        const key = `${partId}|${callout}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lineData.push({ diagramId: diagram.id, partId, callout, qty: parseQty(p.qty), notes: p.notes?.trim() || null });
      }
      if (lineData.length) {
        const res = await prisma.partLine.createMany({ data: lineData, skipDuplicates: true });
        machineLines += res.count;
      }
    }

    nMachines++;
    nLines += machineLines;
    const rate = Math.round(nMachines / ((Date.now() - t0) / 1000));
    console.log(`  [${nMachines}/${files.length}] ${data.machine} (${data.catalog}): ${diagrams.length} diagrams, ${machineLines} lines  (${partCache.size} parts cached)`);
  }

  await prisma.$disconnect();
  console.log("\n=== Done ===");
  console.log(`Machines:   ${nMachines}`);
  console.log(`Diagrams:   ${nDiagrams}`);
  console.log(`PartLines:  ${nLines}`);
  console.log(`Unique parts touched: ${partCache.size}`);
  console.log(`Elapsed: ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
