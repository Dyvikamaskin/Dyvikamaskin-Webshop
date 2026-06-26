/**
 * Phase 1.4 — Sync eParts catalog (Machines + MachineRevisions) into OEM DB.
 *
 * Reads every `data/eparts_v2/*.json` (4,338 files, output of
 * `enumerate_eparts_v2.py` + `enrich_eparts_v2_with_revs.py` +
 * `enrich_eparts_v2_with_per_rev_manuals.py`) and upserts:
 *
 *   - `Machine` rows (one per file)
 *   - `MachineRevision` rows:
 *       • numeric_rev mode → one per revision in `revisions[]`
 *       • serial_range mode → one per non-accessory sparepartsBookList entry
 *
 * Existing rows from the ETL (1,046 Machines, 3,542 MachineRevisions from
 * the older 572-machine walk) are UPDATED in place — `(code, source)` and
 * `(machineId, revisionTag)` unique constraints are the merge keys.
 *
 * Accessory dropdown entries (`isAccessory=true`, e.g. HPU8 under 803)
 * are SKIPPED here. They should either (a) have their own eparts_v2 file
 * if they're separate `sapMaterialType:Machine` SKUs, or (b) be handled by
 * a Phase 1.4b accessory-resolver later.
 *
 * Idempotent — re-running picks up newer field values + adds missing rows.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/eparts/01-catalog-sync.ts [--dry-run]
 */
import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Client } from "pg";

type Eparts = {
  code: string;
  name: string;
  modelToken?: string;
  displayName?: string;
  categories?: Array<{ code: string; name: string }>;
  productImageUrls?: string[];
  summary?: string;
  description?: string;
  sapMaterialType?: string;
  url?: string;
  brochures?: unknown;
  n_books?: number;
  n_revisions?: number;
  n_accessories?: number;
  sparepartsBookList?: Array<{
    sparePartListCode: string | null;
    rawName: string;
    afCode: string | null;
    aiCode: string | null;
    wncFrom: string | null;
    wncTo: string | null;
    isAccessory: boolean;
    leadingToken?: string;
    imageUrl?: string | null;
    productName?: string | null;
    operatingManuals?: unknown[];
    partsManuals?: Array<{ filename?: string; url?: string; size?: number; languages?: unknown; mime?: string }>;
  }>;
  revisions?: Array<{
    revision: string | null;
    name: string | null;
    hasBomTree: boolean;
    n_components: number;
    n_sub_revisions: number;
    imageUrl?: string | null;
    partsManuals?: Array<{ filename?: string; url?: string; size?: number; languages?: unknown; mime?: string }>;
    operatingManuals?: unknown[];
  }>;
  bomAvailability?: {
    mode: "numeric_rev" | "serial_range" | "none";
    anyHasBomTree: boolean;
    totalComponents: number;
    totalRevisions: number;
    totalBooks: number;
    totalRevisionBooks: number;
  };
};

const OEM_URL = process.env.OEM_DIRECT_URL;
const EPARTS_DIR = path.join(process.cwd(), "data", "eparts_v2");
const DRY_RUN = process.argv.includes("--dry-run");

const newId = () => crypto.randomUUID();

function canonicalModelToken(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s_\-/]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function main() {
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  console.log(`[Phase 1.4] catalog-sync starting${DRY_RUN ? " (DRY RUN)" : ""}`);
  const files = fs
    .readdirSync(EPARTS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  console.log(`  ${files.length.toLocaleString()} eparts_v2 machine files`);

  const c = new Client({ connectionString: OEM_URL });
  await c.connect();

  // ───────────────────────────────────────────────────────────────────────
  // Pass 1 — Machines
  // ───────────────────────────────────────────────────────────────────────
  const started = Date.now();
  const machineIdByCode = new Map<string, string>();
  let mInserted = 0;
  let mUpdated = 0;

  // Preload existing Machine rows so we know which are inserts vs updates.
  const existing = await c.query<{ id: string; code: string }>(
    `SELECT id, code FROM "Machine" WHERE "source" = 'EPARTS_API'`,
  );
  for (const row of existing.rows) machineIdByCode.set(row.code, row.id);
  console.log(`  pre-existing EPARTS_API machines: ${existing.rows.length.toLocaleString()}`);

  // Batched upsert: do them one-at-a-time in a transaction with COMMIT every
  // 500. Single-row upserts are slow but trivially correct; can optimise later.
  await c.query("BEGIN");
  let processedM = 0;
  for (const f of files) {
    const filePath = path.join(EPARTS_DIR, f);
    let d: Eparts;
    try {
      d = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      console.error(`  skip bad json: ${f}`);
      continue;
    }
    const code = d.code;
    if (!code) continue;

    const displayName = d.displayName || d.name || code;
    const modelName = d.modelToken || canonicalModelToken(d.name || displayName);
    const categoryPath = d.categories
      ? d.categories.map((cat) => cat.name).filter(Boolean)
      : null;
    const primaryImageUrl =
      d.productImageUrls?.[0] ||
      d.sparepartsBookList?.find((b) => !b.isAccessory && b.imageUrl)?.imageUrl ||
      null;
    // sapMaterialType: 'Machine' is the only one we walked, but if catalog later
    // includes Discontinued products in same set, we'd flip this. Keep false for now.
    const isDiscontinued = false;
    const id = machineIdByCode.get(code) ?? newId();

    if (!DRY_RUN) {
      const res = await c.query<{ id: string; xmax: string }>(
        `INSERT INTO "Machine" (
           "id", "code", "source", "displayName", "modelName", "categoryPath",
           "primaryImageUrl", "summary", "description", "isDiscontinued"
         )
         VALUES ($1, $2, 'EPARTS_API'::"OemCatalogSource", $3, $4, $5::jsonb, $6, $7, $8, $9)
         ON CONFLICT ("code", "source") DO UPDATE SET
           "displayName" = EXCLUDED."displayName",
           "modelName" = EXCLUDED."modelName",
           "categoryPath" = EXCLUDED."categoryPath",
           "primaryImageUrl" = COALESCE(EXCLUDED."primaryImageUrl", "Machine"."primaryImageUrl"),
           "summary" = COALESCE(EXCLUDED."summary", "Machine"."summary"),
           "description" = COALESCE(EXCLUDED."description", "Machine"."description"),
           "isDiscontinued" = EXCLUDED."isDiscontinued",
           "updatedAt" = now()
         RETURNING id, xmax::text`,
        [
          id,
          code,
          displayName,
          modelName,
          categoryPath === null ? null : JSON.stringify(categoryPath),
          primaryImageUrl,
          d.summary ?? null,
          d.description ?? null,
          isDiscontinued,
        ],
      );
      const newRowId = res.rows[0]!.id;
      machineIdByCode.set(code, newRowId);
      if (res.rows[0]!.xmax === "0") mInserted++;
      else mUpdated++;
    }
    processedM++;
    if (processedM % 500 === 0) {
      await c.query("COMMIT");
      await c.query("BEGIN");
      const elapsed = (Date.now() - started) / 1000;
      const rate = processedM / elapsed;
      console.log(
        `  [${processedM}/${files.length}]  inserted=${mInserted} updated=${mUpdated}  ${rate.toFixed(0)} rec/s`,
      );
    }
  }
  await c.query("COMMIT");
  console.log(`  ✓ Machines: +${mInserted} inserted, ${mUpdated} updated`);

  // ───────────────────────────────────────────────────────────────────────
  // Pass 2 — MachineRevisions
  // ───────────────────────────────────────────────────────────────────────
  const revStarted = Date.now();
  let rInserted = 0;
  let rUpdated = 0;
  let rSkippedAccessory = 0;
  let processedR = 0;

  await c.query("BEGIN");
  for (const f of files) {
    const d: Eparts = JSON.parse(fs.readFileSync(path.join(EPARTS_DIR, f), "utf8"));
    const machineId = machineIdByCode.get(d.code);
    if (!machineId) continue;

    const mode = d.bomAvailability?.mode ?? "none";

    if (mode === "numeric_rev") {
      // One MachineRevision per numeric revision
      for (const rev of d.revisions || []) {
        if (rev.revision == null) continue;
        const revisionTag = String(rev.revision);
        const pm = rev.partsManuals?.[0];
        const op = rev.operatingManuals && (rev.operatingManuals as unknown[]).length > 0
          ? JSON.stringify(rev.operatingManuals)
          : null;
        if (!DRY_RUN) {
          const res = await c.query<{ xmax: string }>(
            `INSERT INTO "MachineRevision" (
               "id", "machineId", "revisionTag", "mode", "sparePartListCode",
               "hasBom", "rawName", "imageUrl", "partsManualUrl",
               "partsManualFilename", "operatingManuals"
             ) VALUES ($1, $2, $3, 'NUMERIC'::"RevisionMode", NULL,
                       $4, $5, $6, $7, $8, $9::jsonb)
             ON CONFLICT ("machineId", "revisionTag") DO UPDATE SET
               "hasBom" = EXCLUDED."hasBom",
               "rawName" = COALESCE(EXCLUDED."rawName", "MachineRevision"."rawName"),
               "imageUrl" = COALESCE(EXCLUDED."imageUrl", "MachineRevision"."imageUrl"),
               "partsManualUrl" = COALESCE(EXCLUDED."partsManualUrl", "MachineRevision"."partsManualUrl"),
               "partsManualFilename" = COALESCE(EXCLUDED."partsManualFilename", "MachineRevision"."partsManualFilename"),
               "operatingManuals" = COALESCE(EXCLUDED."operatingManuals", "MachineRevision"."operatingManuals"),
               "updatedAt" = now()
             RETURNING xmax::text`,
            [
              newId(),
              machineId,
              revisionTag,
              rev.hasBomTree ?? false,
              rev.name ?? null,
              rev.imageUrl ?? null,
              pm?.url ?? null,
              pm?.filename ?? null,
              op,
            ],
          );
          if (res.rows[0]!.xmax === "0") rInserted++;
          else rUpdated++;
        }
      }
    } else if (mode === "serial_range") {
      // One MachineRevision per non-accessory sparepartsBookList entry
      for (const book of d.sparepartsBookList || []) {
        if (book.isAccessory) {
          rSkippedAccessory++;
          continue;
        }
        if (!book.sparePartListCode) continue;
        // revisionTag = sparePartListCode (stable per machine, unique per machine)
        const revisionTag = book.sparePartListCode;
        const pm = book.partsManuals?.[0];
        const op = book.operatingManuals && (book.operatingManuals as unknown[]).length > 0
          ? JSON.stringify(book.operatingManuals)
          : null;
        if (!DRY_RUN) {
          const res = await c.query<{ xmax: string }>(
            `INSERT INTO "MachineRevision" (
               "id", "machineId", "revisionTag", "mode", "sparePartListCode",
               "hasBom", "afCode", "aiCode", "serialFrom", "serialTo",
               "rawName", "imageUrl", "partsManualUrl",
               "partsManualFilename", "operatingManuals"
             ) VALUES ($1, $2, $3, 'SERIAL_RANGE'::"RevisionMode", $4,
                       $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
             ON CONFLICT ("machineId", "revisionTag") DO UPDATE SET
               "sparePartListCode" = EXCLUDED."sparePartListCode",
               "hasBom" = EXCLUDED."hasBom",
               "afCode" = COALESCE(EXCLUDED."afCode", "MachineRevision"."afCode"),
               "aiCode" = COALESCE(EXCLUDED."aiCode", "MachineRevision"."aiCode"),
               "serialFrom" = COALESCE(EXCLUDED."serialFrom", "MachineRevision"."serialFrom"),
               "serialTo" = COALESCE(EXCLUDED."serialTo", "MachineRevision"."serialTo"),
               "rawName" = COALESCE(EXCLUDED."rawName", "MachineRevision"."rawName"),
               "imageUrl" = COALESCE(EXCLUDED."imageUrl", "MachineRevision"."imageUrl"),
               "partsManualUrl" = COALESCE(EXCLUDED."partsManualUrl", "MachineRevision"."partsManualUrl"),
               "partsManualFilename" = COALESCE(EXCLUDED."partsManualFilename", "MachineRevision"."partsManualFilename"),
               "operatingManuals" = COALESCE(EXCLUDED."operatingManuals", "MachineRevision"."operatingManuals"),
               "updatedAt" = now()
             RETURNING xmax::text`,
            [
              newId(),
              machineId,
              revisionTag,
              book.sparePartListCode,
              (book.partsManuals?.length || 0) > 0,
              book.afCode ?? null,
              book.aiCode ?? null,
              book.wncFrom ?? null,
              book.wncTo ?? null,
              book.rawName ?? null,
              book.imageUrl ?? null,
              pm?.url ?? null,
              pm?.filename ?? null,
              op,
            ],
          );
          if (res.rows[0]!.xmax === "0") rInserted++;
          else rUpdated++;
        }
      }
    }
    // mode === "none" — machine has no BOM / no books, leave revisions empty
    processedR++;
    if (processedR % 500 === 0) {
      await c.query("COMMIT");
      await c.query("BEGIN");
      const elapsed = (Date.now() - revStarted) / 1000;
      console.log(
        `  rev [${processedR}/${files.length}]  +${rInserted} inserted, ${rUpdated} updated, ${rSkippedAccessory} accessory-skipped  ${(processedR / elapsed).toFixed(0)} rec/s`,
      );
    }
  }
  await c.query("COMMIT");
  console.log(
    `  ✓ MachineRevisions: +${rInserted} inserted, ${rUpdated} updated, ${rSkippedAccessory} accessory entries skipped`,
  );

  // Final counts
  const finalM = await c.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "Machine"`);
  const finalR = await c.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "MachineRevision"`,
  );
  console.log(`\n=== FINAL`);
  console.log(`  Machine          ${parseInt(finalM.rows[0]!.n, 10).toLocaleString()}`);
  console.log(`  MachineRevision  ${parseInt(finalR.rows[0]!.n, 10).toLocaleString()}`);

  await c.end();
}

main().catch((e) => {
  console.error("Phase 1.4 failed:", e);
  process.exit(1);
});
