/**
 * Phase 1 — Canonical Part rows + alias arrays.
 *
 * Reads every row from prod.OemPart (1.38M), groups by canonical_key =
 * COALESCE(legacyPartNumber, partNumber), and writes ~35K rows into the new
 * Part table on the OEM DB. Captures aliases[], picks the best name, and
 * sets isRecommended to any-true across appearances.
 *
 * State file: state/part-id-map.json mapping every raw partNumber to the new
 * Part.id. Phase 5 (partlines) consumes this.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  saveJson,
  canonicalPartKey,
  pickCanonicalPartNumber,
  logProgress,
  chunk,
  newId,
} from "./shared";

interface PartAgg {
  canonicalKey: string;
  codes: Set<string>;     // every (partNumber, legacyPartNumber) we saw
  bestName: string;
  isRecommended: boolean;
  unitOfMeasure: string | null;
}

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL (Dyvika prod) not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  console.log("[phase 1] reading OemPart rows from prod...");
  const started = Date.now();

  const aggsByKey = new Map<string, PartAgg>();

  await withClient(PROD_URL, async (c) => {
    // Cursor-paginate. Order by primary key for deterministic resumption.
    const PAGE = 50_000;
    let lastId: string | null = null;
    let total = 0;
    // First, get the count for ETA
    const countResult = await c.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "OemPart"`,
    );
    const grandTotal = parseInt(countResult.rows[0]!.count, 10);
    console.log(`  total OemPart rows: ${grandTotal.toLocaleString()}`);

    while (true) {
      const q = lastId
        ? `SELECT id, "partNumber", "partName", "legacyPartNumber", "unitOfMeasure", "isRecommended"
           FROM "OemPart" WHERE id > $1 ORDER BY id ASC LIMIT $2`
        : `SELECT id, "partNumber", "partName", "legacyPartNumber", "unitOfMeasure", "isRecommended"
           FROM "OemPart" ORDER BY id ASC LIMIT $1`;
      const params = lastId ? [lastId, PAGE] : [PAGE];
      const res = await c.query<{
        id: string;
        partNumber: string;
        partName: string;
        legacyPartNumber: string | null;
        unitOfMeasure: string | null;
        isRecommended: boolean;
      }>(q, params);
      if (res.rows.length === 0) break;

      for (const row of res.rows) {
        const key = canonicalPartKey(row.partNumber, row.legacyPartNumber);
        let agg = aggsByKey.get(key);
        if (!agg) {
          agg = {
            canonicalKey: key,
            codes: new Set<string>(),
            bestName: row.partName,
            isRecommended: false,
            unitOfMeasure: null,
          };
          aggsByKey.set(key, agg);
        }
        agg.codes.add(row.partNumber);
        if (row.legacyPartNumber) agg.codes.add(row.legacyPartNumber);
        // Prefer the longest non-empty name (heuristic: more descriptive)
        if (row.partName && row.partName.length > (agg.bestName || "").length) {
          agg.bestName = row.partName;
        }
        if (row.isRecommended) agg.isRecommended = true;
        if (row.unitOfMeasure && !agg.unitOfMeasure) {
          agg.unitOfMeasure = row.unitOfMeasure;
        }
      }
      lastId = res.rows[res.rows.length - 1]!.id;
      total += res.rows.length;
      if (total % 200_000 === 0 || res.rows.length < PAGE) {
        logProgress("OemPart read", total, grandTotal, started);
      }
    }
    console.log(`  ✓ aggregated into ${aggsByKey.size.toLocaleString()} canonical parts`);
  });

  // Build the Part rows. partId is the canonical_key, prefixed with a stable
  // marker so we can derive it deterministically. Using cuid via Postgres
  // default is also fine; we let Prisma's default generate them on insert.
  // We build a partKey → newPartId map by writing in batches and reading
  // back the ids — actually simpler: we generate cuids in this script.
  // Even simpler: use the canonical partNumber itself as the new Part.id,
  // since Part.partNumber is unique. But: schema uses cuid().
  //
  // Approach: insert in batches of 1000 with RETURNING id, partNumber.
  // Then build the rawPartNumber → newPartId map for downstream phases.

  console.log("\n[phase 1] writing canonical Part rows to OEM DB...");
  const writeStarted = Date.now();

  const rows = [...aggsByKey.values()];
  const rawToNewId = new Map<string, string>();

  await withClient(OEM_URL, async (c) => {
    // Clear table first (idempotent re-run support)
    await c.query(`TRUNCATE "Part" RESTART IDENTITY CASCADE`);

    const BATCH = 1000;
    const batches = chunk(rows, BATCH);
    let written = 0;
    for (const batch of batches) {
      // Build INSERT ... VALUES ... RETURNING id, partNumber
      const placeholders: string[] = [];
      const values: unknown[] = [];
      batch.forEach((agg, i) => {
        const partNumber = pickCanonicalPartNumber(agg.codes);
        const aliases = [...agg.codes].filter((x) => x !== partNumber).sort();
        const base = i * 7;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
        );
        values.push(
          newId(),                     // $1 id
          partNumber,                  // $2 partNumber
          aliases,                     // $3 aliases (text[])
          agg.bestName,                // $4 name
          agg.unitOfMeasure,           // $5 unitOfMeasure
          agg.isRecommended,           // $6 isRecommended
          [],                          // $7 sources — populated in later phases
        );
      });
      const sql = `
        INSERT INTO "Part" ("id", "partNumber", "aliases", "name", "unitOfMeasure", "isRecommended", "sources")
        VALUES ${placeholders.join(", ")}
        RETURNING id, "partNumber"
      `;
      const res = await c.query<{ id: string; partNumber: string }>(sql, values);

      // Build the rawPartNumber → newPartId map. We need this for all alias
      // codes too, not just the canonical, so phase 5 can resolve any input.
      for (let i = 0; i < res.rows.length; i++) {
        const r = res.rows[i]!;
        rawToNewId.set(r.partNumber, r.id);
        // Also map every alias to the same id
        const aggForThis = batch[i]!;
        for (const code of aggForThis.codes) {
          rawToNewId.set(code, r.id);
        }
      }

      written += batch.length;
      if (written % 5000 === 0 || written === rows.length) {
        logProgress("Part write", written, rows.length, writeStarted);
      }
    }
  });

  saveJson("part-id-map.json", Object.fromEntries(rawToNewId));
  console.log(
    `\n✓ phase 1 done — ${aggsByKey.size.toLocaleString()} canonical parts written, ` +
      `${rawToNewId.size.toLocaleString()} raw codes mapped, ` +
      `state/part-id-map.json saved.`,
  );
}

main().catch((e) => {
  console.error("phase 1 failed:", e);
  process.exit(1);
});
