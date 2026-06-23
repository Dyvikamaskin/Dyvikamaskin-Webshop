/**
 * Seed the OEM parts catalog from extracted PDF parts books.
 *
 * Reads `prisma/draft/wn_parts_export.json` (produced by
 * `export_wn_sqlite.py` from `WN manuals an files/wn_parts.sqlite`)
 * and writes:
 *
 *   OemMachine   (source=PDF, one per PDF manual)
 *   OemMachineRevision   (one synthetic revision per manual — PDFs don't
 *                         carry revision history the way the eParts API
 *                         does; we record the docIssue as the revision)
 *   OemComponent (one per assembly_group)
 *   OemPart      (one per part)
 *
 * Each PDF row creates a SEPARATE OemMachine from any eParts-API row
 * with the same code, because the schema's unique key is (code, source).
 * A future linking step can match (code, EPARTS_API) ↔ (code, PDF) when
 * the codes line up.
 *
 *   1. Refresh the JSON export first:
 *        python prisma/draft/export_wn_sqlite.py \
 *          --db "WN manuals an files/wn_parts.sqlite" \
 *          --out prisma/draft/wn_parts_export.json
 *
 *   2. Run the seed:
 *        npx tsx prisma/seed-oem-pdfs.ts
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OemCatalogSource, Prisma } from "../src/app/generated/prisma/client";

type ExportPart = {
  ref_pos: string | null;
  part_number: string;
  description: string;
  qty: number | null;
  measurement: string | null;
  torque: string | null;
  is_recommended: boolean;
};

type ExportGroup = {
  group_name: string;
  group_seq: number | null;
  diagram_page: number | null;
  drawing_file: string | null;
  parts: ExportPart[];
};

type ExportModel = {
  model_name: string;
  category: string | null;
  doc_number: string | null;
  doc_issue: string | null;
  source_pdf: string | null;
  page_count: number | null;
  groups: ExportGroup[];
};

type ExportPayload = {
  exported_at: string;
  source_db: string;
  counts: { models: number; groups: number; parts: number };
  models: ExportModel[];
};

const EXPORT_PATH = resolve(
  process.cwd(),
  process.env.WN_EXPORT_PATH ?? "prisma/draft/wn_parts_export.json",
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Try to recover the canonical machine code from a PDF filename.
 *  Patterns we know:
 *    SP__<MODEL>_<rev>_<...>_<10-digit>.pdf  →  the trailing 10-digit number
 *    <7-or-10-digit>_Rev<rev>.pdf            →  the leading code
 *  Fallback: use the basename verbatim (prefixed) so the row is still
 *  uniquely identifiable.
 */
function deriveMachineCode(model_name: string, source_pdf: string | null): string {
  if (!source_pdf) return `pdf:model:${model_name}`;
  const base = source_pdf.replace(/\.pdf$/i, "");
  const trailing = base.match(/(\d{10})$/);
  if (trailing) return trailing[1];
  const leading = base.match(/^(\d{7,10})/);
  if (leading) return leading[1];
  return `pdf:${base}`;
}

async function findWackerNeusonMakeId(): Promise<string | null> {
  const row = await prisma.machineMake.findFirst({
    where: { slug: "wacker-neuson" },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function ingestModel(model: ExportModel, makeId: string | null) {
  const code = deriveMachineCode(model.model_name, model.source_pdf);

  const machine = await prisma.oemMachine.upsert({
    where: { code_source: { code, source: OemCatalogSource.PDF } },
    create: {
      code,
      name: model.model_name,
      makeId,
      categoryPath: model.category ? [model.category] : Prisma.JsonNull,
      source: OemCatalogSource.PDF,
    },
    update: {
      name: model.model_name,
      makeId,
      categoryPath: model.category ? [model.category] : Prisma.JsonNull,
    },
    select: { id: true },
  });

  // PDFs don't carry a true revision dimension. Synthesise one — use the
  // docIssue ("12.2004" / "07.2010" etc.) as the revision tag, falling
  // back to "pdf" when missing.
  const revisionTag = (model.doc_issue || "pdf").trim() || "pdf";

  const revision = await prisma.oemMachineRevision.upsert({
    where: { machineId_revision: { machineId: machine.id, revision: revisionTag } },
    create: {
      machineId: machine.id,
      revision: revisionTag,
      name: model.doc_number ? `Doc ${model.doc_number}` : null,
      hasBomTree: true,
    },
    update: {
      name: model.doc_number ? `Doc ${model.doc_number}` : null,
    },
    select: { id: true },
  });

  let comps = 0;
  let parts = 0;
  for (const g of model.groups ?? []) {
    // Component code: group_name isn't a stable identifier across re-runs,
    // so we derive a deterministic synthetic key. group_seq is stable in
    // SQLite, so use that prefixed with "pdf:".
    const compCode = `pdf:seq:${g.group_seq ?? "?"}:${g.group_name.slice(0, 60)}`;

    const compRow = await prisma.oemComponent.upsert({
      where: {
        revisionId_componentCode: { revisionId: revision.id, componentCode: compCode },
      },
      create: {
        revisionId: revision.id,
        position: g.group_seq,
        name: g.group_name,
        componentCode: compCode,
        diagramImageFilename: g.drawing_file ?? null,
      },
      update: {
        position: g.group_seq,
        name: g.group_name,
        diagramImageFilename: g.drawing_file ?? null,
      },
      select: { id: true },
    });
    comps++;

    if (g.parts.length > 0) {
      await prisma.oemPart.deleteMany({ where: { componentId: compRow.id } });
      // Build notes from measurement / torque (the SP/alfis extractor
      // captures these but the new schema doesn't have dedicated columns —
      // pack them as JSON in notes).
      await prisma.oemPart.createMany({
        data: g.parts.map((p) => {
          const notesBits: string[] = [];
          if (p.measurement) notesBits.push(`measurement=${p.measurement}`);
          if (p.torque) notesBits.push(`torque=${p.torque}`);
          return {
            componentId: compRow.id,
            calloutNumber: p.ref_pos ?? null,
            partNumber: p.part_number,
            partName: p.description,
            qty: p.qty,
            unitOfMeasure: null, // PDFs don't carry UOM
            isRecommended: p.is_recommended,
            notes: notesBits.length > 0 ? notesBits.join("; ") : null,
          };
        }),
      });
      parts += g.parts.length;
    }
  }
  return { comps, parts };
}

async function main() {
  console.log(`Reading ${EXPORT_PATH} ...`);
  const raw = await readFile(EXPORT_PATH, "utf-8");
  const payload = JSON.parse(raw) as ExportPayload;
  console.log(
    `Source: ${payload.source_db}  (exported ${payload.exported_at})`,
  );
  console.log(
    `Models=${payload.counts.models}  groups=${payload.counts.groups}  parts=${payload.counts.parts}`,
  );

  const makeId = await findWackerNeusonMakeId();
  if (!makeId) {
    console.warn(
      "No MachineMake row matching slug='wacker-neuson'. OemMachine.makeId will be null.",
    );
  }

  const t0 = Date.now();
  let machines = 0;
  let totalComps = 0;
  let totalParts = 0;
  for (let i = 0; i < payload.models.length; i++) {
    const m = payload.models[i];
    const r = await ingestModel(m, makeId);
    machines++;
    totalComps += r.comps;
    totalParts += r.parts;
    if ((i + 1) % 25 === 0 || i === payload.models.length - 1) {
      const elapsed = (Date.now() - t0) / 1000;
      console.log(
        `  [${i + 1}/${payload.models.length}] machines=${machines} ` +
          `comps=${totalComps} parts=${totalParts} (${elapsed.toFixed(1)}s)`,
      );
    }
  }

  const elapsed = (Date.now() - t0) / 1000;
  console.log();
  console.log("Done.");
  console.log(`  PDF machines:  ${machines}`);
  console.log(`  components:    ${totalComps}`);
  console.log(`  parts:         ${totalParts}`);
  console.log(`  elapsed:       ${elapsed.toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
