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
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, "").trim();
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

  // Extract assembly name from header
  const nameMatch = html.match(/id="contHeader"[^>]*>([\s\S]*?)<\/div>/);
  const name = stripTags(nameMatch?.[1] ?? "").replace(/\\\s*/g, "").replace(/\s+/g, " ").trim();

  const parts: Part[] = [];
  const subIds: number[] = [];

  // Parse each table row
  const trRe = /<tr class="row_\d+ highlite"[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const trHtml = trMatch[1];
    const onclickMatch = trHtml.match(/goTo\(0,\s*(\d+)/);
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
    assemblyCache.clear(); // IDs restart per catalog

    // Switch to this catalog — follow the redirect chain to get the new tok
    let catTok = tok;
    try {
      const loadHtml = await get(
        `${BASE}/action.php?func=load&catalog=${cat.idx}&cL=&uL=en&action=0&tok=${tok}`
      );
      catTok = extractTok(loadHtml) ?? tok;
      // The load response is the new index page — get a fresh tok from it
      const refreshHtml = await get(`${BASE}/index.php`);
      catTok = extractTok(refreshHtml) ?? catTok;
    } catch (e) {
      console.log(`  Could not switch catalog: ${e}`);
    }

    // Walk the catalog starting from assembly id=1 (root of each catalog)
    // Probe a few IDs until we stop getting valid assemblies
    let id = 1;
    let emptyStreak = 0;
    while (emptyStreak < 3) {
      const outFile = path.join(OUT_DIR, `${cat.name}_id${id}.jsonl`);
      if (fs.existsSync(outFile)) {
        console.log(`  id=${id}: Already done — skipping`);
        id++; emptyStreak = 0;
        continue;
      }

      try {
        const html = await get(`${BASE}/action.php?func=printAssembly&id=${id}&highlite=null&tok=${catTok}`);
        // Check if it's a valid assembly (has a real header, not an error)
        if (!html.includes("scTblDiv") && !html.includes("contBody")) {
          emptyStreak++;
          id++;
          continue;
        }
        emptyStreak = 0;

        const assembly = await walkAssembly(id, catTok);
        if (countParts(assembly) === 0 && assembly.subAssemblies.length === 0) {
          id++; continue;
        }

        const safeName = assembly.name.replace(/[/\\:*?"<>|]/g, "_").slice(0, 60);
        const finalOut = path.join(OUT_DIR, `${cat.name}_${safeName}.jsonl`);
        fs.writeFileSync(finalOut, JSON.stringify({
          catalog: cat.name,
          machine: assembly.name,
          assemblyId: id,
          tree: assembly,
        }) + "\n");
        console.log(`  id=${id} "${assembly.name}": ${countParts(assembly)} parts → ${path.basename(finalOut)}`);
      } catch (e) {
        console.error(`  id=${id}: Error ${e}`);
        emptyStreak++;
      }

      id++;
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
