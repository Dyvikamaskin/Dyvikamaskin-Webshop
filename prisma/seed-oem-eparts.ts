/**
 * Seed the OEM parts catalog from shop.wackerneuson.com eParts JSON dumps.
 *
 * Reads every `WN manuals an files/eparts/*.json` produced by
 * `enumerate_wn_eparts_full.py` and writes:
 *
 *   OemMachine          (source=EPARTS_API)
 *   OemMachineRevision  (one per revision in the JSON)
 *   OemComponent        (top-level devices + sub-revision devices flattened,
 *                        with subRevisionName set for sub-rev rows)
 *   OemPart             (the parts list under each component)
 *
 * The .hd3 hotspot JSON is read from the local `WN manuals an files/eparts_assets/`
 * directory (downloaded by `download_eparts_assets.py`) and inlined onto
 * OemComponent.hotspotsJson — gives the storefront the click-coordinate
 * data without a re-fetch.
 *
 * Idempotent: re-running upserts machines/revisions/components and
 * deletes-and-reinserts parts under each component.
 *
 *   npx tsx prisma/seed-oem-eparts.ts
 */
import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OemCatalogSource, Prisma } from "../src/app/generated/prisma/client";

const ROOT = resolve(process.cwd(), "WN manuals an files");
const EPARTS_DIR = join(ROOT, "eparts");
const ASSETS_DIR = join(ROOT, "eparts_assets");

type EpartsPart = {
  diagramCalloutNumber: string | null;
  diagramQuantity: string | null;
  partName: string;
  partNumber: string;
  unitOfMeasure: string | null;
};

type EpartsComponent = {
  code: string;
  revision: string;
  parts: EpartsPart[] | null;
  diagram: {
    diagramImage: { id: string; filename: string } | null;
    diagramCoordinates: { id: string; filename: string } | null;
  } | null;
} | null;

type EpartsDevice = {
  name: string;
  position: string | null;
  sub_product_code: string;
  revision_level: string | null;
  sub_machine_code?: string;
  component: EpartsComponent;
};

type EpartsRevision = {
  revision: string;
  name: string | null;
  has_bom_tree: boolean | null;
  components: EpartsDevice[];
  sub_revisions: Array<{ name: string; devices: EpartsDevice[] }>;
};

type EpartsJson = {
  machine_code: string;
  machine_name: string;
  category_path?: string[];
  revisions: EpartsRevision[];
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const hotspotCache = new Map<string, unknown>();

async function loadHotspots(filename: string | null): Promise<unknown | null> {
  if (!filename) return null;
  if (hotspotCache.has(filename)) return hotspotCache.get(filename)!;
  try {
    const buf = await readFile(join(ASSETS_DIR, filename), "utf-8");
    const json = JSON.parse(buf);
    hotspotCache.set(filename, json);
    return json;
  } catch {
    hotspotCache.set(filename, null);
    return null;
  }
}

async function findWackerNeusonMakeId(): Promise<string | null> {
  const row = await prisma.machineMake.findFirst({
    where: { slug: "wacker-neuson" },
    select: { id: true },
  });
  return row?.id ?? null;
}

function parseIntOrNull(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function ingestMachine(json: EpartsJson, makeId: string | null) {
  const categoryPath = json.category_path ?? Prisma.JsonNull;
  // Upsert the OemMachine row.
  const machine = await prisma.oemMachine.upsert({
    where: {
      code_source: { code: json.machine_code, source: OemCatalogSource.EPARTS_API },
    },
    create: {
      code: json.machine_code,
      name: json.machine_name,
      makeId,
      categoryPath,
      source: OemCatalogSource.EPARTS_API,
    },
    update: {
      name: json.machine_name,
      makeId,
      categoryPath,
    },
    select: { id: true },
  });

  let revsCreated = 0;
  let compsCreated = 0;
  let partsCreated = 0;

  for (const rev of json.revisions ?? []) {
    const revRow = await prisma.oemMachineRevision.upsert({
      where: { machineId_revision: { machineId: machine.id, revision: rev.revision } },
      create: {
        machineId: machine.id,
        revision: rev.revision,
        name: rev.name ?? null,
        hasBomTree: rev.has_bom_tree ?? true,
      },
      update: {
        name: rev.name ?? null,
        hasBomTree: rev.has_bom_tree ?? true,
      },
      select: { id: true },
    });
    revsCreated++;

    // Build a flat list of (device, subRevisionName | null) tuples.
    const all: Array<{ dev: EpartsDevice; subRev: string | null }> = [];
    for (const dev of rev.components ?? []) all.push({ dev, subRev: null });
    for (const sub of rev.sub_revisions ?? []) {
      for (const dev of sub.devices ?? []) all.push({ dev, subRev: sub.name });
    }

    for (const { dev, subRev } of all) {
      const comp = dev.component;
      const img = comp?.diagram?.diagramImage ?? null;
      const hd3 = comp?.diagram?.diagramCoordinates ?? null;
      const hotspots = await loadHotspots(hd3?.filename ?? null);
      const hotspotsJson = hotspots == null ? Prisma.JsonNull : (hotspots as Prisma.InputJsonValue);

      const compRow = await prisma.oemComponent.upsert({
        where: {
          revisionId_componentCode: {
            revisionId: revRow.id,
            componentCode: dev.sub_product_code,
          },
        },
        create: {
          revisionId: revRow.id,
          position: parseIntOrNull(dev.position),
          name: dev.name,
          componentCode: dev.sub_product_code,
          revisionLevel: dev.revision_level ?? null,
          subRevisionName: subRev,
          diagramImageFilename: img?.filename ?? null,
          diagramImageSourceId: img?.id ?? null,
          hotspotsJson,
        },
        update: {
          position: parseIntOrNull(dev.position),
          name: dev.name,
          revisionLevel: dev.revision_level ?? null,
          subRevisionName: subRev,
          diagramImageFilename: img?.filename ?? null,
          diagramImageSourceId: img?.id ?? null,
          hotspotsJson,
        },
        select: { id: true },
      });
      compsCreated++;

      const parts = comp?.parts ?? [];
      if (parts.length > 0) {
        // Delete then re-insert — there's no natural unique key on parts
        // within a component (callouts can repeat).
        await prisma.oemPart.deleteMany({ where: { componentId: compRow.id } });
        await prisma.oemPart.createMany({
          data: parts.map((p) => ({
            componentId: compRow.id,
            calloutNumber: p.diagramCalloutNumber ?? null,
            partNumber: p.partNumber,
            partName: p.partName,
            qty: parseIntOrNull(p.diagramQuantity),
            unitOfMeasure: p.unitOfMeasure ?? null,
          })),
        });
        partsCreated += parts.length;
      }
    }
  }

  return { revsCreated, compsCreated, partsCreated };
}

async function main() {
  console.log(`Reading ${EPARTS_DIR} ...`);
  const files = (await readdir(EPARTS_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  console.log(`Found ${files.length} machine JSONs.`);

  const makeId = await findWackerNeusonMakeId();
  if (!makeId) {
    console.warn(
      "No MachineMake row matching slug='wacker-neuson'. OemMachine.makeId will be null.",
    );
  } else {
    console.log(`Wacker Neuson makeId: ${makeId}`);
  }

  const t0 = Date.now();
  let machinesIngested = 0;
  let machinesEmpty = 0;
  let totalRevs = 0;
  let totalComps = 0;
  let totalParts = 0;

  for (let i = 0; i < files.length; i++) {
    const path = join(EPARTS_DIR, files[i]);
    const raw = await readFile(path, "utf-8");
    const json = JSON.parse(raw) as EpartsJson;

    // Still insert an OemMachine row for empty machines — gives the
    // storefront something to display when a code is searched.
    if (!json.revisions || json.revisions.length === 0) {
      const categoryPath = json.category_path ?? Prisma.JsonNull;
      await prisma.oemMachine.upsert({
        where: {
          code_source: { code: json.machine_code, source: OemCatalogSource.EPARTS_API },
        },
        create: {
          code: json.machine_code,
          name: json.machine_name,
          makeId,
          categoryPath,
          source: OemCatalogSource.EPARTS_API,
        },
        update: {
          name: json.machine_name,
          makeId,
          categoryPath,
        },
      });
      machinesEmpty++;
    } else {
      const r = await ingestMachine(json, makeId);
      machinesIngested++;
      totalRevs += r.revsCreated;
      totalComps += r.compsCreated;
      totalParts += r.partsCreated;
    }

    if ((i + 1) % 25 === 0 || i === files.length - 1) {
      const elapsed = (Date.now() - t0) / 1000;
      console.log(
        `  [${i + 1}/${files.length}] machines=${machinesIngested} empty=${machinesEmpty} ` +
          `revs=${totalRevs} comps=${totalComps} parts=${totalParts} (${elapsed.toFixed(1)}s)`,
      );
    }
  }

  const elapsed = (Date.now() - t0) / 1000;
  console.log();
  console.log("Done.");
  console.log(`  machines with data: ${machinesIngested}`);
  console.log(`  machines empty:     ${machinesEmpty}`);
  console.log(`  revisions:          ${totalRevs}`);
  console.log(`  components:         ${totalComps}`);
  console.log(`  parts:              ${totalParts}`);
  console.log(`  elapsed:            ${elapsed.toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
