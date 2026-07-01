/**
 * Phase 5 — Move OemPart → PartLine (the big one, 1.38M rows).
 *
 * Streams OemPart in pages, resolves diagramId via diagram-id-map and partId
 * via part-id-map. Writes PartLine rows in batches.
 *
 * Composite PK is (diagramId, partId, callout) so empty callouts become "" —
 * the schema sets that default. Duplicates within the same component (same
 * part appearing twice with the same callout) are deduped at insert time.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  loadJson,
  canonicalPartKey,
  chunk,
  logProgress,
} from "./shared";

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  const partMap = loadJson<Record<string, string>>("part-id-map.json", {});
  const diagramMap = loadJson<Record<string, string>>("diagram-id-map.json", {});
  if (Object.keys(partMap).length === 0) throw new Error("part-id-map.json missing");
  if (Object.keys(diagramMap).length === 0) throw new Error("diagram-id-map.json missing");

  const started = Date.now();
  console.log("[phase 5] streaming OemPart → PartLine ...");

  let written = 0;
  let skipped = 0;
  await withClient(PROD_URL, async (prod) => {
    await withClient(OEM_URL, async (oem) => {
      await oem.query(`TRUNCATE "PartLine" RESTART IDENTITY CASCADE`);
      const PAGE = 25_000;
      let lastId: string | null = null;
      let totalRead = 0;
      const countRow = await prod.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "OemPart"`,
      );
      const grand = parseInt(countRow.rows[0]!.count, 10);
      console.log(`  total OemPart rows: ${grand.toLocaleString()}`);

      while (true) {
        const q = lastId
          ? `SELECT id, "componentId", "partNumber", "legacyPartNumber",
                    "calloutNumber", "qty", "notes", "isRecommended"
             FROM "OemPart" WHERE id > $1 ORDER BY id ASC LIMIT $2`
          : `SELECT id, "componentId", "partNumber", "legacyPartNumber",
                    "calloutNumber", "qty", "notes", "isRecommended"
             FROM "OemPart" ORDER BY id ASC LIMIT $1`;
        const params = lastId ? [lastId, PAGE] : [PAGE];
        const res = await prod.query<{
          id: string;
          componentId: string;
          partNumber: string;
          legacyPartNumber: string | null;
          calloutNumber: string | null;
          qty: number | null;
          notes: string | null;
          isRecommended: boolean;
        }>(q, params);
        if (res.rows.length === 0) break;

        // De-duplicate inside this page on (diagramId, partId, callout) so the
        // PK doesn't reject the batch.
        const seen = new Set<string>();
        const passedBatch: Array<{
          diagramId: string;
          partId: string;
          callout: string;
          qty: number | null;
          notes: string | null;
          isRecommended: boolean;
        }> = [];
        for (const r of res.rows) {
          const diagramId = diagramMap[r.componentId];
          if (!diagramId) {
            skipped++;
            continue;
          }
          const key = canonicalPartKey(r.partNumber, r.legacyPartNumber);
          const partId = partMap[key] ?? partMap[r.partNumber];
          if (!partId) {
            skipped++;
            continue;
          }
          const callout = r.calloutNumber ?? "";
          const dedupKey = `${diagramId}|${partId}|${callout}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          passedBatch.push({
            diagramId,
            partId,
            callout,
            qty: r.qty,
            notes: r.notes,
            isRecommended: r.isRecommended,
          });
        }

        // Insert in smaller chunks of 2000 — keeps single SQL text under ~1MB
        for (const sub of chunk(passedBatch, 2000)) {
          const placeholders: string[] = [];
          const values: unknown[] = [];
          sub.forEach((p, i) => {
            const base = i * 6;
            placeholders.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
            );
            values.push(p.diagramId, p.partId, p.callout, p.qty, p.notes, p.isRecommended);
          });
          const sql = `
            INSERT INTO "PartLine" ("diagramId", "partId", "callout", "qty", "notes", "isRecommended")
            VALUES ${placeholders.join(", ")}
            ON CONFLICT ("diagramId", "partId", "callout") DO NOTHING
          `;
          await oem.query(sql, values);
        }
        written += passedBatch.length;
        lastId = res.rows[res.rows.length - 1]!.id;
        totalRead += res.rows.length;
        if (totalRead % 100_000 === 0 || res.rows.length < PAGE) {
          logProgress("PartLine write", totalRead, grand, started);
        }
      }
    });
  });

  console.log(`\n✓ phase 5 done — ${written.toLocaleString()} PartLine rows written, ${skipped} skipped (FK miss).`);
}

main().catch((e) => {
  console.error("phase 5 failed:", e);
  process.exit(1);
});
