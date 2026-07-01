/**
 * Phase 2 — Move OemMachine → Machine.
 *
 * Reads ~1,000 rows from prod.OemMachine, normalises modelName for cross-source
 * joining, writes Machine rows into the OEM DB.
 *
 * State file: state/machine-id-map.json mapping old OemMachine.id → new Machine.id.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  saveJson,
  canonicalModelToken,
  chunk,
  logProgress,
  newId,
} from "./shared";

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  const started = Date.now();
  console.log("[phase 2] reading OemMachine rows from prod...");

  type Row = {
    id: string;
    code: string;
    name: string;
    source: string;
    parentMachineCode: string | null;
    categoryPath: unknown;
    makeId: string | null;
  };
  const rows: Row[] = [];
  await withClient(PROD_URL, async (c) => {
    const res = await c.query<Row>(
      `SELECT id, code, name, source::text AS source, "parentMachineCode", "categoryPath", "makeId"
       FROM "OemMachine" ORDER BY id ASC`,
    );
    rows.push(...res.rows);
  });
  console.log(`  ✓ ${rows.length.toLocaleString()} OemMachine rows`);

  console.log("\n[phase 2] writing Machine rows to OEM DB...");
  const oldToNewId = new Map<string, string>();
  const codeSrcToNewId = new Map<string, string>();   // "code|source" → new id

  await withClient(OEM_URL, async (c) => {
    await c.query(`TRUNCATE "Machine" RESTART IDENTITY CASCADE`);

    // First pass: insert without parentMachineId so we can resolve self-refs after
    const BATCH = 500;
    let written = 0;
    for (const batch of chunk(rows, BATCH)) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      batch.forEach((r, i) => {
        const modelName = canonicalModelToken(r.name);
        const base = i * 7;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}::text::"OemCatalogSource", $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
        );
        // categoryPath comes back from prod as either a JS array (when the
        // column truly was jsonb) or a Postgres-array literal text (when the
        // pg type was inferred wrong). Force JSON serialise.
        const categoryPathJson =
          r.categoryPath == null ? null : JSON.stringify(r.categoryPath);
        values.push(
          newId(),                      // $1 id
          r.code,                       // $2 code
          r.source,                     // $3 source (cast)
          r.name,                       // $4 displayName
          modelName,                    // $5
          categoryPathJson,             // $6 categoryPath JSON
          false,                        // $7 isDiscontinued
        );
      });
      const sql = `
        INSERT INTO "Machine" ("id", "code", "source", "displayName", "modelName", "categoryPath", "isDiscontinued")
        VALUES ${placeholders.join(", ")}
        RETURNING id, code, "source"
      `;
      const res = await c.query<{ id: string; code: string; source: string }>(sql, values);
      // Map old IDs to new IDs.  We rely on order alignment between batch and res.rows
      // because INSERT RETURNING preserves VALUES order in PostgreSQL.
      for (let i = 0; i < res.rows.length; i++) {
        const newId = res.rows[i]!.id;
        const old = batch[i]!;
        oldToNewId.set(old.id, newId);
        codeSrcToNewId.set(`${old.code}|${old.source}`, newId);
      }
      written += batch.length;
    }
    logProgress("Machine write", written, rows.length, started);

    // Second pass: resolve parentMachineCode → parentMachineId.
    // OemMachine.parentMachineCode is a string code, not an FK. Match by
    // (parentMachineCode, source).
    let withParent = 0;
    for (const r of rows) {
      if (!r.parentMachineCode) continue;
      const parentNewId = codeSrcToNewId.get(`${r.parentMachineCode}|${r.source}`);
      if (!parentNewId) continue;
      const childNewId = oldToNewId.get(r.id);
      if (!childNewId) continue;
      await c.query(`UPDATE "Machine" SET "parentMachineId" = $1 WHERE id = $2`, [
        parentNewId,
        childNewId,
      ]);
      withParent++;
    }
    console.log(`  ✓ resolved ${withParent} parent links`);
  });

  saveJson("machine-id-map.json", Object.fromEntries(oldToNewId));
  saveJson("machine-code-source-map.json", Object.fromEntries(codeSrcToNewId));
  console.log(
    `\n✓ phase 2 done — ${rows.length} Machine rows, state files saved.`,
  );
}

main().catch((e) => {
  console.error("phase 2 failed:", e);
  process.exit(1);
});
