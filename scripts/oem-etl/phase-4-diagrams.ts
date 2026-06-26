/**
 * Phase 4 — Move OemComponent → Diagram.
 *
 * State file: state/diagram-id-map.json mapping old OemComponent.id → new Diagram.id.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  saveJson,
  loadJson,
  chunk,
  logProgress,
  newId,
} from "./shared";

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  const revMap = loadJson<Record<string, string>>("revision-id-map.json", {});
  if (Object.keys(revMap).length === 0) {
    throw new Error("revision-id-map.json missing — run phase 3 first");
  }

  const started = Date.now();
  console.log("[phase 4] reading OemComponent rows from prod...");
  type Row = {
    id: string;
    revisionId: string;
    position: number | null;
    name: string;
    componentCode: string | null;
    revisionLevel: string | null;
    subRevisionName: string | null;
    diagramImageFilename: string | null;
    diagramImageSourceId: string | null;
    hotspotsJson: unknown;
  };
  // Stream in pages to keep memory bounded — ~80K rows.
  const oldToNewId = new Map<string, string>();
  await withClient(PROD_URL, async (prod) => {
    await withClient(OEM_URL, async (oem) => {
      await oem.query(`TRUNCATE "Diagram" RESTART IDENTITY CASCADE`);
      const PAGE = 5_000;
      let lastId: string | null = null;
      let total = 0;
      const countResult = await prod.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "OemComponent"`,
      );
      const grandTotal = parseInt(countResult.rows[0]!.count, 10);
      console.log(`  total OemComponent rows: ${grandTotal.toLocaleString()}`);
      while (true) {
        const q = lastId
          ? `SELECT id, "revisionId", "position", "name", "componentCode",
                    "revisionLevel", "subRevisionName", "diagramImageFilename",
                    "diagramImageSourceId", "hotspotsJson"
             FROM "OemComponent" WHERE id > $1 ORDER BY id ASC LIMIT $2`
          : `SELECT id, "revisionId", "position", "name", "componentCode",
                    "revisionLevel", "subRevisionName", "diagramImageFilename",
                    "diagramImageSourceId", "hotspotsJson"
             FROM "OemComponent" ORDER BY id ASC LIMIT $1`;
        const params = lastId ? [lastId, PAGE] : [PAGE];
        const res = await prod.query<Row>(q, params);
        if (res.rows.length === 0) break;

        const passedBatch: Row[] = [];
        const placeholders: string[] = [];
        const values: unknown[] = [];
        let bi = 0;
        for (const r of res.rows) {
          const newRev = revMap[r.revisionId];
          if (!newRev) continue;
          const base = bi * 10;
          placeholders.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`,
          );
          const hotspotsJson = r.hotspotsJson == null ? null : JSON.stringify(r.hotspotsJson);
          values.push(
            newId(),                           // $1 id
            newRev,                            // $2 revisionId
            r.position,                        // $3 position
            r.name,                            // $4 name
            r.componentCode,                   // $5 componentCode
            r.revisionLevel,                   // $6 revisionLevel
            r.subRevisionName,                 // $7 subRevisionName
            r.diagramImageFilename,            // $8 diagramImageKey
            r.diagramImageSourceId,            // $9 diagramImageSourceId
            hotspotsJson,                      // $10 hotspotsJson
          );
          passedBatch.push(r);
          bi++;
        }
        if (placeholders.length > 0) {
          const sql = `
            INSERT INTO "Diagram"
              ("id", "revisionId", "position", "name", "componentCode", "revisionLevel",
               "subRevisionName", "diagramImageKey", "diagramImageSourceId", "hotspotsJson")
            VALUES ${placeholders.join(", ")}
            RETURNING id
          `;
          const inserted = await oem.query<{ id: string }>(sql, values);
          for (let i = 0; i < inserted.rows.length; i++) {
            oldToNewId.set(passedBatch[i]!.id, inserted.rows[i]!.id);
          }
        }

        lastId = res.rows[res.rows.length - 1]!.id;
        total += res.rows.length;
        if (total % 20_000 === 0 || res.rows.length < PAGE) {
          logProgress("Diagram write", total, grandTotal, started);
        }
      }
    });
  });

  saveJson("diagram-id-map.json", Object.fromEntries(oldToNewId));
  console.log(`\n✓ phase 4 done — ${oldToNewId.size.toLocaleString()} Diagram rows.`);
}

main().catch((e) => {
  console.error("phase 4 failed:", e);
  process.exit(1);
});
