/**
 * Phase 6 — Move OemPartCompatibility → PartCompatibility.
 *
 * Resolves partId via part-id-map. Skips rows whose partNumber isn't in
 * the canonical catalog (logs count). Optionally resolves machineId via
 * machine-code-source-map when a machineNumber is present.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  loadJson,
  canonicalModelToken,
  chunk,
  logProgress,
  newId,
} from "./shared";

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  const partMap = loadJson<Record<string, string>>("part-id-map.json", {});
  if (Object.keys(partMap).length === 0) throw new Error("part-id-map.json missing");

  const started = Date.now();
  console.log("[phase 6] reading OemPartCompatibility ...");

  type Row = {
    id: string;
    partNumber: string;
    machineModel: string | null;
    machineNumbers: string[] | null;
    source: string;
  };
  let rows: Row[] = [];
  await withClient(PROD_URL, async (prod) => {
    // Prod schema: partNumber, machineModel, machineName, machineNumbers[],
    // source (text, e.g. "dhs" or "lsengineers"), sourceUrl, scrapedAt.
    const res = await prod.query<Row>(
      `SELECT id, "partNumber", "machineModel", "machineNumbers", "source"
       FROM "OemPartCompatibility" ORDER BY id ASC`,
    );
    // Avoid `push(...res.rows)` — spreads 365K args and blows the call stack.
    rows = res.rows;
  });
  console.log(`  ✓ ${rows.length.toLocaleString()} compatibility rows`);

  // Map sources from old enum -> new CompatSource enum.
  // Old: DHS_FITMENT | LSENGINEERS | EPARTS | ...   (uppercase variants)
  // New: DHS | LSENGINEERS | EPARTS_API | MANUAL
  const SOURCE_REMAP: Record<string, string> = {
    DHS_FITMENT: "DHS",
    DHS: "DHS",
    LSENGINEERS: "LSENGINEERS",
    EPARTS: "EPARTS_API",
    EPARTS_API: "EPARTS_API",
    MANUAL: "MANUAL",
  };

  let written = 0;
  let skipped = 0;
  let passedFilter = 0;
  let dedupedInBatch = 0;
  await withClient(OEM_URL, async (oem) => {
    await oem.query(`TRUNCATE "PartCompatibility" RESTART IDENTITY CASCADE`);
    for (const batch of chunk(rows, 1000)) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let bi = 0;
      const seen = new Set<string>();
      for (const r of batch) {
        const partId = partMap[r.partNumber];
        const modelName = r.machineModel ? canonicalModelToken(r.machineModel) : null;
        const newSource = SOURCE_REMAP[r.source.toUpperCase()] ?? "MANUAL";
        if (!partId || !modelName) {
          skipped++;
          continue;
        }
        passedFilter++;
        // Dedup on the (partId, modelName, source) unique key inside this batch
        const dedupKey = `${partId}|${modelName}|${newSource}`;
        if (seen.has(dedupKey)) { dedupedInBatch++; continue; }
        seen.add(dedupKey);
        const base = bi * 5;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::"CompatSource")`,
        );
        values.push(newId(), partId, modelName, null /* machineId */, newSource);
        bi++;
      }
      if (placeholders.length === 0) continue;
      const sql = `
        INSERT INTO "PartCompatibility" ("id", "partId", "modelName", "machineId", "source")
        VALUES ${placeholders.join(", ")}
        ON CONFLICT ("partId", "modelName", "source") DO NOTHING
      `;
      try {
        const result = await oem.query(sql, values);
        written += result.rowCount ?? placeholders.length;
      } catch (e) {
        console.log("  SQL ERROR:", (e as Error).message.slice(0, 200));
        throw e;
      }
    }
    logProgress("PartCompatibility write", written, rows.length, started);
    console.log(`  passedFilter=${passedFilter}  dedupedInBatch=${dedupedInBatch}`);
    console.log(`  ⚠ ${skipped} skipped (no matching part or model)`);
  });

  console.log(`\n✓ phase 6 done — ${written.toLocaleString()} PartCompatibility rows.`);
}

main().catch((e) => {
  console.error("phase 6 failed:", e);
  process.exit(1);
});
