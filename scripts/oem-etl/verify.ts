/**
 * verify.ts — counts every table on both sides + spot-checks 10 random
 * canonical parts end-to-end. Run after all 8 phases complete.
 */
import { PROD_URL, OEM_URL, withClient } from "./shared";

async function countAll(label: string, url: string, tables: Array<[string, string]>) {
  console.log(`\n=== ${label}`);
  await withClient(url, async (c) => {
    for (const [tbl, displayName] of tables) {
      try {
        const r = await c.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "${tbl}"`);
        console.log(`  ${displayName.padEnd(28)} ${parseInt(r.rows[0]!.n, 10).toLocaleString().padStart(12)}`);
      } catch {
        console.log(`  ${displayName.padEnd(28)} (does not exist)`);
      }
    }
  });
}

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  await countAll("PROD (source)", PROD_URL, [
    ["OemMachine", "OemMachine"],
    ["OemMachineRevision", "OemMachineRevision"],
    ["OemComponent", "OemComponent"],
    ["OemPart", "OemPart"],
    ["OemPartCompatibility", "OemPartCompatibility"],
    ["OemPartListing", "OemPartListing"],
    ["PartPriceSnapshot", "PartPriceSnapshot"],
  ]);

  await countAll("OEM (destination)", OEM_URL, [
    ["Machine", "Machine"],
    ["MachineRevision", "MachineRevision"],
    ["Diagram", "Diagram"],
    ["Part", "Part"],
    ["PartLine", "PartLine"],
    ["PartCompatibility", "PartCompatibility"],
    ["PartListing", "PartListing"],
    ["PartPriceSnapshot", "PartPriceSnapshot"],
  ]);

  // Spot-check 10 random canonical parts end-to-end
  console.log("\n=== spot-check 10 random Parts");
  await withClient(OEM_URL, async (c) => {
    const r = await c.query<{
      id: string;
      partNumber: string;
      aliases: string[];
      name: string;
      lines: string;
    }>(
      `SELECT p.id, p."partNumber", p."aliases", p."name",
              (SELECT COUNT(*)::text FROM "PartLine" pl WHERE pl."partId" = p.id) AS lines
       FROM "Part" p
       ORDER BY RANDOM() LIMIT 10`,
    );
    for (const row of r.rows) {
      console.log(
        `  ${row.partNumber.padEnd(12)} aliases=${row.aliases.length.toString().padStart(2)}  lines=${row.lines.padStart(6)}  ${row.name.slice(0, 50)}`,
      );
    }
  });
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
