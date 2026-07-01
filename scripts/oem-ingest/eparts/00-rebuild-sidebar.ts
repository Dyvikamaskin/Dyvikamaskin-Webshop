/**
 * 00-rebuild-sidebar.ts
 *
 * Rebuilds the sidebar machine list from the DB, covering all 6000+ machines
 * (not just the original 4412 scraped from the eParts sidebar).
 *
 * Also resets the bom-walk progress file so 03-bom-walk.ts re-walks everything.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/eparts/00-rebuild-sidebar.ts [--reset-progress]
 */
import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import * as fs from "fs";
import * as path from "path";
import { Client } from "pg";

const SIDEBAR_FILE = path.resolve("data/eparts_v2/_sidebar_all.json");
const PROGRESS_FILE = path.resolve("data/eparts_v2/_bom_walk_progress.json");

const args = process.argv.slice(2);
const resetProgress = args.includes("--reset-progress");

async function main() {
  const c = new Client({ connectionString: process.env.OEM_DIRECT_URL! });
  await c.connect();

  const { rows } = await c.query<{
    code: string;
    displayName: string | null;
    modelName: string | null;
    categoryPath: string[] | null;
  }>(`
    SELECT code, "displayName", "modelName", "categoryPath"
    FROM "Machine"
    WHERE source = 'EPARTS_API'
    ORDER BY code
  `);

  await c.end();

  const machines = rows.map((r) => ({
    code: r.code,
    name: r.displayName ?? r.modelName ?? r.code,
    topCategory: (r.categoryPath as any)?.[0] ?? "Unknown",
  }));

  const sidebar = {
    fetched_at: new Date().toISOString(),
    count: machines.length,
    machines,
  };

  fs.writeFileSync(SIDEBAR_FILE, JSON.stringify(sidebar, null, 2));
  console.log(`Wrote ${machines.length} machines to ${SIDEBAR_FILE}`);

  if (resetProgress) {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log("Progress file reset.");
    } else {
      console.log("No progress file to reset.");
    }
  } else {
    console.log("Run with --reset-progress to also clear the bom-walk progress file.");
  }
}

main().catch(console.error);
