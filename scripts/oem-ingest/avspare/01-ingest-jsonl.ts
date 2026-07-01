/**
 * 01-ingest-jsonl.ts
 *
 * Ingests a JSONL file produced by the AVSpare browser crawler into the local
 * OEM DB (oem_catalog on localhost:5432).
 *
 * Idempotent — checks for existing rows before inserting. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/avspare/01-ingest-jsonl.ts [path/to/file.jsonl]
 *   # Default: ~/Downloads/hitachi_zx210_parts.jsonl
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import * as crypto from "crypto";
import { Client } from "pg";

const DEFAULT_JSONL = path.join(os.homedir(), "Downloads", "hitachi_zx210_parts.jsonl");
const JSONL_PATH = process.argv[2] ?? DEFAULT_JSONL;

interface RawGroup {
  brand: string;
  family: string;
  variant: string;
  book: string;
  bookUuid: string;
  section: string;
  models: string[];
  group: string;
  groupUuid: string;
  imageUrl: string | null;
  parts: { pos: string; partNumber: string; qty: number; name: string; comments: string; }[];
}

function cleanVariant(raw: string): string {
  return raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
}

function partsHash(parts: RawGroup["parts"]): string {
  if (parts.length === 0) return "EMPTY";
  const sorted = [...parts].sort((a, b) =>
    a.pos.localeCompare(b.pos) || a.partNumber.localeCompare(b.partNumber)
  );
  return crypto.createHash("md5")
    .update(sorted.map(p => `${p.partNumber}|${p.pos}|${p.qty}`).join(","))
    .digest("hex");
}

async function getOrCreate(
  c: Client,
  table: string,
  lookupCol: string,
  lookupVal: string,
  insertCols: string[],
  insertVals: any[]
): Promise<string> {
  const existing = await c.query<{ id: string }>(
    `SELECT id FROM "${table}" WHERE "${lookupCol}" = $1 LIMIT 1`,
    [lookupVal]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const res = await c.query<{ id: string }>(
    `INSERT INTO "${table}" (id, ${insertCols.map(col => `"${col}"`).join(", ")})
     VALUES (gen_random_uuid()::text, ${insertVals.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id`,
    insertVals
  );
  return res.rows[0].id;
}

async function main() {
  if (!fs.existsSync(JSONL_PATH)) {
    console.error(`File not found: ${JSONL_PATH}`); process.exit(1);
  }

  const c = new Client({ connectionString: process.env.OEM_DIRECT_URL! });
  await c.connect();

  const urlStr = process.env.OEM_DIRECT_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(urlStr)) {
    console.error("Refusing: OEM_DIRECT_URL is not local."); await c.end(); process.exit(1);
  }

  // Read all lines
  const lines: RawGroup[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(JSONL_PATH) });
  for await (const line of rl) {
    const t = line.trim();
    if (t) lines.push(JSON.parse(t));
  }
  console.log(`Loaded ${lines.length} groups from ${JSONL_PATH}`);

  // --- Machines ---
  const machineIdMap = new Map<string, string>();
  const seenMachines = new Set<string>();
  for (const g of lines) {
    const key = `${g.brand}::${g.family}`;
    if (seenMachines.has(key)) continue;
    seenMachines.add(key);
    const code = `avspare:${g.brand.toLowerCase()}:${g.family.toLowerCase()}`;
    const displayName = `${g.brand} ${g.family.toUpperCase()}`;
    const modelName = g.family.toUpperCase(); // e.g. "ZX210"
    const id = await getOrCreate(c, "Machine", "code", code,
      ["code", "displayName", "modelName", "categoryPath", "source", "createdAt", "updatedAt"],
      [code, displayName, modelName, JSON.stringify(["AVSpare", g.brand]), "AVSPARE_COM", new Date(), new Date()]
    );
    machineIdMap.set(key, id);
    console.log(`  Machine: ${displayName} → ${id}`);
  }

  // --- MachineRevisions ---
  const revisionIdMap = new Map<string, string>();
  const seenRevisions = new Set<string>();
  for (const g of lines) {
    const machineKey = `${g.brand}::${g.family}`;
    const slug = cleanVariant(g.variant);
    const vkey = `${machineKey}::${slug}`;
    if (seenRevisions.has(vkey)) continue;
    seenRevisions.add(vkey);
    const machineId = machineIdMap.get(machineKey)!;

    // Check by (machineId, revisionTag)
    const existing = await c.query<{ id: string }>(
      `SELECT id FROM "MachineRevision" WHERE "machineId" = $1 AND "revisionTag" = $2 LIMIT 1`,
      [machineId, slug]
    );
    let revId: string;
    if (existing.rows.length > 0) {
      revId = existing.rows[0].id;
    } else {
      const res = await c.query<{ id: string }>(
        `INSERT INTO "MachineRevision" (id, "machineId", "revisionTag", mode, "bomSource", "hasBom", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'NUMERIC'::"RevisionMode", 'AVSPARE_COM'::"OemCatalogSource", true, NOW(), NOW())
         RETURNING id`,
        [machineId, slug]
      );
      revId = res.rows[0].id;
    }
    revisionIdMap.set(vkey, revId);
  }
  console.log(`Upserted ${seenRevisions.size} MachineRevisions`);

  // --- Part cache ---
  const partIdCache = new Map<string, string>();
  async function getOrCreatePart(partNumber: string, name: string): Promise<string> {
    if (partIdCache.has(partNumber)) return partIdCache.get(partNumber)!;
    const existing = await c.query<{ id: string }>(
      `SELECT id FROM "Part" WHERE "partNumber" = $1 LIMIT 1`, [partNumber]
    );
    if (existing.rows.length > 0) {
      partIdCache.set(partNumber, existing.rows[0].id);
      return existing.rows[0].id;
    }
    const res = await c.query<{ id: string }>(
      `INSERT INTO "Part" (id, "partNumber", name, sources, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, ARRAY['AVSPARE_COM'::"OemCatalogSource"], NOW(), NOW())
       RETURNING id`,
      [partNumber, name]
    );
    partIdCache.set(partNumber, res.rows[0].id);
    return res.rows[0].id;
  }

  // --- Diagrams + PartLines ---
  let diagrams = 0, partLines = 0, skippedEmpty = 0, skippedDiagrams = 0;
  const seenDiagramKeys = new Set<string>();

  for (const g of lines) {
    const machineKey = `${g.brand}::${g.family}`;
    const slug = cleanVariant(g.variant);
    const vkey = `${machineKey}::${slug}`;
    const revisionId = revisionIdMap.get(vkey)!;
    const diagKey = `${revisionId}::${g.groupUuid}`;

    if (seenDiagramKeys.has(diagKey)) { skippedDiagrams++; continue; }
    seenDiagramKeys.add(diagKey);

    if (g.parts.length === 0) skippedEmpty++;

    const hash = partsHash(g.parts);

    // Check existing diagram by (revisionId, componentCode=groupUuid)
    const existingDiag = await c.query<{ id: string }>(
      `SELECT id FROM "Diagram" WHERE "revisionId" = $1 AND "componentCode" = $2 LIMIT 1`,
      [revisionId, g.groupUuid]
    );
    let diagramId: string;
    if (existingDiag.rows.length > 0) {
      diagramId = existingDiag.rows[0].id;
      skippedDiagrams++;
      continue; // already ingested
    } else {
      const dRes = await c.query<{ id: string }>(
        `INSERT INTO "Diagram" (id, "revisionId", "componentCode", name, "diagramImageKey", "partsHash", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        [revisionId, g.groupUuid, g.group, g.imageUrl ?? null, hash]
      );
      diagramId = dRes.rows[0].id;
      diagrams++;
    }

    for (const p of g.parts) {
      const partId = await getOrCreatePart(p.partNumber, p.name);

      // Check existing PartLine
      const existingPL = await c.query(
        `SELECT 1 FROM "PartLine" WHERE "diagramId" = $1 AND callout = $2 AND "partId" = $3 LIMIT 1`,
        [diagramId, p.pos, partId]
      );
      if (existingPL.rows.length > 0) continue;

      await c.query(
        `INSERT INTO "PartLine" ("diagramId", "partId", callout, qty, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [diagramId, partId, p.pos, p.qty, p.comments || null]
      );
      partLines++;
    }

    if (diagrams % 20 === 0) process.stdout.write(`\r  ${diagrams} diagrams, ${partLines} part lines...`);
  }

  await c.end();
  console.log(`\n\n=== Done ===`);
  console.log(`  Machines:       ${seenMachines.size}`);
  console.log(`  Revisions:      ${seenRevisions.size}`);
  console.log(`  Diagrams new:   ${diagrams} (${skippedEmpty} empty groups)`);
  console.log(`  PartLines new:  ${partLines}`);
}

main().catch(e => { console.error(e); process.exit(1); });
