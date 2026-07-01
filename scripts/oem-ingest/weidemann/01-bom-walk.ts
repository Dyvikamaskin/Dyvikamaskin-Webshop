/**
 * Weidemann eService BOM Walker
 *
 * Walks all catalogs on service.weidemann.de and extracts the full assembly/parts tree.
 * Outputs one JSONL file per machine to data/weidemann_raw/.
 *
 * Auth: session-based. Set WEIDEMANN_SESSION env var to the PHPSESSID cookie value
 * (copy from browser DevTools → Application → Cookies → service.weidemann.de).
 *
 * Usage:
 *   WEIDEMANN_SESSION=<phpsessid> npx tsx scripts/oem-ingest/weidemann/01-bom-walk.ts
 */

import { config } from "dotenv";
config(); config({ path: ".env.local", override: true });

import fs from "fs";
import path from "path";

const BASE = "https://service.weidemann.de/catalogcreator/template";
const SESSION = process.env.WEIDEMANN_SESSION!;
const OUT_DIR = path.join(process.cwd(), "data", "weidemann_raw");

if (!SESSION) {
  console.error("WEIDEMANN_SESSION env var required. Copy PHPSESSID from browser.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      cookie: `PHPSESSID=${SESSION}`,
      "user-agent": "Mozilla/5.0 (compatible; IndustriPartsBot/1.0)",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

function extractTok(html: string): string | null {
  const m = html.match(/tok=([a-f0-9]{32})/);
  return m ? m[1] : null;
}

// ── Assembly walker ───────────────────────────────────────────────────────────

type Part = {
  callout: string;
  partNumber: string;
  description: string;
  notes: string;
  qty: string;
  unit: string;
};

type Assembly = {
  id: number;
  name: string;
  parts: Part[];
  subAssemblies: Assembly[];
};

const assemblyCache = new Map<number, Assembly>();

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").trim();
}

// The assembly name is the bare text node right after the (hidden) breadcrumb div
// closes and before the breadcrumb-toggle <img>:
//   <div id="breadcrumb" ...>...</div>Service kit&nbsp;<img ...>
function extractName(html: string): string {
  let m = html.match(/id="breadcrumb"[\s\S]*?<\/div>([^<]*?)<img/);
  if (m && stripTags(m[1])) return clean(m[1]);
  m = html.match(/id="contHeader"[^>]*>([\s\S]*?)<img/);
  return m ? clean(m[1]) : "";
}

function clean(s: string): string {
  return stripTags(s).replace(/\\\s*/g, "").replace(/\s+/g, " ").trim();
}

function parseTdCells(trHtml: string): string[] {
  const cells: string[] = [];
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = tdRe.exec(trHtml)) !== null) {
    cells.push(stripTags(m[1]).trim());
  }
  return cells;
}

async function walkAssembly(id: number, tok: string, depth = 0): Promise<Assembly> {
  if (assemblyCache.has(id)) return assemblyCache.get(id)!;

  const html = await get(`${BASE}/action.php?func=printAssembly&id=${id}&highlite=null&tok=${tok}`);

  const name = extractName(html);

  const parts: Part[] = [];
  const subIds: number[] = [];

  // Parse each table row
  const trRe = /<tr class="row_\d+ highlite"[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const trHtml = trMatch[1];
    // Sub-assembly drill-down rows use goTo(catalogIdx, assemblyId) — the first
    // arg is the active catalog index (0 for 10er, 2 for 12er, ...), not always 0.
    const onclickMatch = trHtml.match(/goTo\(\d+,\s*(\d+)/);
    const cells = parseTdCells(trHtml);

    if (onclickMatch) {
      subIds.push(parseInt(onclickMatch[1]));
    } else if (cells.length >= 6) {
      // Leaf: ["", callout, partNumber, description, notes, qty, unit]
      parts.push({
        callout: cells[1] ?? "",
        partNumber: cells[2] ?? "",
        description: cells[3] ?? "",
        notes: cells[4] ?? "",
        qty: cells[5] ?? "",
        unit: cells[6] ?? "",
      });
    }
  }

  const subAssemblies: Assembly[] = [];
  for (const childId of subIds) {
    if (depth < 20) {
      const child = await walkAssembly(childId, tok, depth + 1);
      subAssemblies.push(child);
    }
  }

  const assembly: Assembly = { id, name, parts, subAssemblies };
  assemblyCache.set(id, assembly);
  return assembly;
}

// ── Catalog discovery ─────────────────────────────────────────────────────────

type CatalogInfo = { idx: number; name: string };
type MachineInfo = { assemblyId: number; name: string; catalog: string };

function parseCatalogsAndMachines(html: string): { catalogs: CatalogInfo[]; machines: MachineInfo[] } {
  const catalogs: CatalogInfo[] = [];
  const machines: MachineInfo[] = [];

  // Catalogs: <div title="10er_Serie" ... id="navCatalog_0" ...>
  // Attribute order varies — capture the whole opening tag
  const catRe = /<div[^>]+navCatalog_(\d+)[^>]*>/g;
  let m;
  while ((m = catRe.exec(html)) !== null) {
    const tag = m[0];
    const titleM = tag.match(/title="([^"]+)"/);
    if (titleM) catalogs.push({ idx: parseInt(m[1]), name: titleM[1] });
  }

  // Machines: <div id="sId_N" ...><table...><td ... title="1030CX20" ...>
  const machRe = /<div[^>]+id="sId_(\d+)"[\s\S]{0,400}?navDesc"[^>]*title="([^"]+)"/g;
  while ((m = machRe.exec(html)) !== null) {
    machines.push({ assemblyId: parseInt(m[1]), name: m[2], catalog: catalogs[0]?.name ?? "" });
  }

  return { catalogs, machines };
}

// Top-level machine models in the active catalog's nav tree are at margin-left:15px;
// sub-assembly groups (cooling, axles, ...) are deeper (30px+) and skipped here.
// sId_N is the assembly id to walk for that model.
function parseModels(html: string, catalogName: string): MachineInfo[] {
  const models: MachineInfo[] = [];
  const re = /id="sId_(\d+)"[^>]*margin-left:\s*15px[\s\S]{0,600}?class="navDesc" title="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[2].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
    models.push({ assemblyId: parseInt(m[1]), name, catalog: catalogName });
  }
  return models;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load initial page to get tok and catalog list
  const indexHtml = await get(`${BASE}/index.php`);
  const tok = extractTok(indexHtml);
  if (!tok) throw new Error("Could not extract tok from page — session may have expired");
  console.log(`Session OK, tok=${tok}`);

  const { catalogs } = parseCatalogsAndMachines(indexHtml);
  console.log(`Found ${catalogs.length} catalogs`);

  for (const cat of catalogs) {
    console.log(`\n── Catalog ${cat.idx}: ${cat.name} ──`);
    assemblyCache.clear(); // assembly IDs restart per catalog

    // Switch to this catalog — the load response carries the new nav tree
    let catTok = tok;
    let models: MachineInfo[] = [];
    try {
      const loadHtml = await get(
        `${BASE}/action.php?func=load&catalog=${cat.idx}&cL=&uL=en&action=0&tok=${tok}`
      );
      catTok = extractTok(loadHtml) ?? tok;
      models = parseModels(loadHtml, cat.name);
      if (models.length === 0) {
        // Fall back to a fresh index page
        const refreshHtml = await get(`${BASE}/index.php`);
        catTok = extractTok(refreshHtml) ?? catTok;
        models = parseModels(refreshHtml, cat.name);
      }
    } catch (e) {
      console.log(`  Could not switch catalog: ${e}`);
      continue;
    }

    if (models.length === 0) {
      console.log(`  No machine models found — skipping`);
      continue;
    }
    console.log(`  ${models.length} models`);

    for (const model of models) {
      const safe = model.name.replace(/[/\\:*?"<>|]/g, "_").slice(0, 80);
      const outFile = path.join(OUT_DIR, `${cat.name}__${safe}.jsonl`);
      // Resume: skip only if a previous run captured real parts. Re-walk files
      // left at 0 parts by an earlier (buggy) run.
      if (fs.existsSync(outFile)) {
        try {
          const prev = JSON.parse(fs.readFileSync(outFile, "utf-8"));
          if (countParts(prev.tree) > 0) {
            console.log(`  [${model.assemblyId}] "${model.name}": Already done — skipping`);
            continue;
          }
        } catch { /* fall through and re-walk */ }
      }

      try {
        const assembly = await walkAssembly(model.assemblyId, catTok);
        const parts = countParts(assembly);
        fs.writeFileSync(outFile, JSON.stringify({
          catalog: cat.name,
          machine: model.name,
          assemblyId: model.assemblyId,
          tree: assembly,
        }) + "\n");
        console.log(`  [${model.assemblyId}] "${model.name}": ${parts} parts → ${path.basename(outFile)}`);
      } catch (e) {
        console.error(`  [${model.assemblyId}] "${model.name}": Error ${e}`);
      }
      await sleep(200);
    }
  }

  console.log("\nDone.");
}

function countParts(a: Assembly): number {
  return a.parts.length + a.subAssemblies.reduce((s, c) => s + countParts(c), 0);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(console.error);
