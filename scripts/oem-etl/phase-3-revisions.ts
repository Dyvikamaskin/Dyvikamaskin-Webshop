/**
 * Phase 3 — Move OemMachineRevision → MachineRevision.
 *
 * Parses revisionTag to detect mode (NUMERIC vs SERIAL_RANGE) + extracts
 * AF/AI + WNC range from rawName when available. Uses machine-id-map.json
 * to resolve FKs.
 *
 * State file: state/revision-id-map.json mapping old OemMachineRevision.id
 * → new MachineRevision.id.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  saveJson,
  loadJson,
  parseRevisionMode,
  chunk,
  logProgress,
  newId,
} from "./shared";

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  const machineMap = loadJson<Record<string, string>>("machine-id-map.json", {});
  if (Object.keys(machineMap).length === 0) {
    throw new Error("machine-id-map.json missing — run phase 2 first");
  }

  const started = Date.now();
  console.log("[phase 3] reading OemMachineRevision rows from prod...");
  type Row = {
    id: string;
    machineId: string;
    revision: string;
    name: string | null;
    hasBomTree: boolean;
  };
  const rows: Row[] = [];
  await withClient(PROD_URL, async (c) => {
    const res = await c.query<Row>(
      `SELECT id, "machineId", "revision", "name", "hasBomTree"
       FROM "OemMachineRevision" ORDER BY id ASC`,
    );
    rows.push(...res.rows);
  });
  console.log(`  ✓ ${rows.length.toLocaleString()} revision rows`);

  const oldToNewId = new Map<string, string>();
  await withClient(OEM_URL, async (c) => {
    await c.query(`TRUNCATE "MachineRevision" RESTART IDENTITY CASCADE`);
    let written = 0;
    let skipped = 0;
    for (const batch of chunk(rows, 500)) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      const passedBatch: Row[] = [];
      let bi = 0;
      for (const r of batch) {
        const newMachineId = machineMap[r.machineId];
        if (!newMachineId) {
          skipped++;
          continue;
        }
        const mode = parseRevisionMode(r.revision);
        const base = bi * 7;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::"RevisionMode", $${base + 5}, $${base + 6}, $${base + 7})`,
        );
        values.push(
          newId(),                     // $1 id
          newMachineId,                // $2 machineId
          r.revision,                  // $3 revisionTag
          mode,                        // $4 mode (enum)
          r.hasBomTree,                // $5 hasBom
          null,                        // $6 sparePartListCode — unknown for now
          r.name,                      // $7 rawName
        );
        passedBatch.push(r);
        bi++;
      }
      if (placeholders.length === 0) continue;
      const sql = `
        INSERT INTO "MachineRevision"
          ("id", "machineId", "revisionTag", "mode", "hasBom", "sparePartListCode", "rawName")
        VALUES ${placeholders.join(", ")}
        RETURNING id
      `;
      const res = await c.query<{ id: string }>(sql, values);
      for (let i = 0; i < res.rows.length; i++) {
        oldToNewId.set(passedBatch[i]!.id, res.rows[i]!.id);
      }
      written += res.rows.length;
    }
    logProgress("MachineRevision write", written, rows.length, started);
    if (skipped) console.log(`  ⚠ ${skipped} revisions skipped (machine FK miss)`);
  });

  saveJson("revision-id-map.json", Object.fromEntries(oldToNewId));
  console.log(`\n✓ phase 3 done — ${oldToNewId.size} MachineRevision rows.`);
}

main().catch((e) => {
  console.error("phase 3 failed:", e);
  process.exit(1);
});
