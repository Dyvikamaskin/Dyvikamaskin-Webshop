/**
 * 03-download-images.ts
 *
 * Downloads the exploded-view diagram drawings for the ingested Weidemann
 * diagrams and sets Diagram.diagramImageKey.
 *
 * Each Weidemann assembly page (printAssembly?id=N) loads its drawing via:
 *     player('https://service.weidemann.de/catalogcreator/media/{mediaId}.svgz', '')
 * a gzipped vector SVG. The mediaId lives ONLY on the page, so we must fetch a
 * page to learn it.
 *
 * Optimisation: by the catalog's dedup rule (identical part-list ⇒ same physical
 * diagram), we fetch ONE representative per unique (catalog, partsHash) group to
 * discover its mediaId, download the SVGZ once (deduped by mediaId), then set the
 * same diagramImageKey on every diagram in the group. ~9.3K fetches vs 44K rows.
 *
 * Resume-safe: only processes diagrams whose diagramImageKey IS NULL, so a rerun
 * after a session-cookie expiry continues where it left off. Stops cleanly if the
 * session is dead (no tok) — get a fresh PHPSESSID and rerun.
 *
 * Auth: WEIDEMANN_SESSION env var = PHPSESSID cookie.
 * Usage:
 *   WEIDEMANN_SESSION=<phpsessid> npx tsx scripts/oem-ingest/weidemann/03-download-images.ts [--limit=N] [--catalog=NAME]
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/app/generated/oem-prisma/client.ts";

const BASE = "https://service.weidemann.de/catalogcreator/template";
const MEDIA_RE = /player\('https?:\/\/[^']*\/media\/([^'./]+)\.svgz'/;
const SESSION = process.env.WEIDEMANN_SESSION;
const OUT_DIR = path.resolve("data/weidemann_assets/weidemann");
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1]) : Infinity;
})();
const CATALOG_FILTER = (() => {
  const a = process.argv.find((x) => x.startsWith("--catalog="));
  return a ? a.split("=")[1] : null;
})();

if (!SESSION) {
  console.error("WEIDEMANN_SESSION env var required (PHPSESSID cookie).");
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

// accept-encoding: identity prevents undici from auto-decompressing the
// transfer (it crashes with "incorrect header check" on responses whose
// declared gzip encoding doesn't match the body). We handle gzip ourselves.
const HEADERS = {
  cookie: `PHPSESSID=${SESSION}`,
  "user-agent": "Mozilla/5.0 (compatible; IndustriPartsBot/1.0)",
  "accept-encoding": "identity",
};
async function getText(url: string): Promise<{ status: number; body: string }> {
  const r = await fetch(url, { headers: HEADERS });
  return { status: r.status, body: await r.text() };
}
async function getBuf(url: string): Promise<{ status: number; buf: Buffer }> {
  const r = await fetch(url, { headers: HEADERS });
  return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
}
const extractTok = (html: string) => html.match(/tok=([a-f0-9]{32})/)?.[1] ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.OEM_DATABASE_URL! }) });
  const url = process.env.OEM_DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("Refusing to run: OEM_DATABASE_URL is not local."); await prisma.$disconnect(); process.exit(1);
  }

  // Group diagrams needing an image by (catalog, partsHash). Pick a representative
  // componentCode per group; collect all member diagram ids.
  type Group = { catalog: string; componentCode: string; ids: string[] };
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    WITH sig AS (
      SELECT d.id,
             (m."categoryPath"->>1) AS catalog,
             d."componentCode" AS cc,
             md5(coalesce(string_agg(pl."partId" || '|' || pl.callout || '|' || COALESCE(pl.qty,0)::text, ',' ORDER BY pl.callout, pl."partId"), 'EMPTY')) AS h
      FROM "Diagram" d
      JOIN "MachineRevision" r ON r.id = d."revisionId"
      JOIN "Machine" m ON m.id = r."machineId"
      LEFT JOIN "PartLine" pl ON pl."diagramId" = d.id
      WHERE r."bomSource"::text = 'WEIDEMANN_ESERVICE' AND d."diagramImageKey" IS NULL
      GROUP BY d.id, catalog, cc
    )
    SELECT catalog, h,
           (array_agg(cc ORDER BY id))[1] AS rep_cc,
           array_agg(id) AS ids
    FROM sig
    ${CATALOG_FILTER ? `WHERE catalog = '${CATALOG_FILTER.replace(/'/g, "''")}'` : ""}
    GROUP BY catalog, h
    ORDER BY catalog`);

  let groups: Group[] = rows.map((r) => ({ catalog: r.catalog, componentCode: String(r.rep_cc), ids: r.ids as string[] }));
  const totalDiagrams = groups.reduce((s, g) => s + g.ids.length, 0);
  if (LIMIT !== Infinity) groups = groups.slice(0, LIMIT);
  console.log(`Groups needing images: ${groups.length}  (covering ${totalDiagrams} diagrams)`);
  if (groups.length === 0) { console.log("Nothing to do."); await prisma.$disconnect(); return; }

  // Session + catalog name→index map
  const idx = await getText(`${BASE}/index.php`);
  const tok0 = extractTok(idx.body);
  if (!tok0) { console.error("Session dead (no tok). Provide a fresh PHPSESSID and rerun."); await prisma.$disconnect(); process.exit(2); }
  const catIndex = new Map<string, number>();
  for (const m of idx.body.matchAll(/<div[^>]+navCatalog_(\d+)[^>]*>/g)) {
    const t = m[0].match(/title="([^"]+)"/); if (t) catIndex.set(t[1], parseInt(m[1]));
  }

  // Process catalog by catalog (one func=load per catalog)
  const byCatalog = new Map<string, Group[]>();
  for (const g of groups) { if (!byCatalog.has(g.catalog)) byCatalog.set(g.catalog, []); byCatalog.get(g.catalog)!.push(g); }

  const mediaOnDisk = new Set<string>();
  let nFetched = 0, nDownloaded = 0, nDiagramsSet = 0, nNoDrawing = 0;
  const t0 = Date.now();

  for (const [catalog, catGroups] of byCatalog) {
    const ci = catIndex.get(catalog);
    if (ci === undefined) { console.log(`  [skip] catalog "${catalog}" not in nav map`); continue; }
    const load = await getText(`${BASE}/action.php?func=load&catalog=${ci}&cL=&uL=en&action=0&tok=${tok0}`);
    let tok = extractTok(load.body) ?? tok0;
    const refresh = await getText(`${BASE}/index.php`);
    tok = extractTok(refresh.body) ?? tok;
    if (!tok) { console.error("Session expired mid-run. Rerun with a fresh PHPSESSID (resumes)."); break; }
    console.log(`\n── ${catalog} (idx ${ci}): ${catGroups.length} groups ──`);

    let dead = false;
    for (const g of catGroups) {
      try {
        const page = await getText(`${BASE}/action.php?func=printAssembly&id=${g.componentCode}&highlite=null&tok=${tok}`);
        nFetched++;
        if (page.status !== 200 || !page.body) { console.error(`  id=${g.componentCode}: HTTP ${page.status}`); continue; }
        if (!extractTok(page.body) && !page.body.includes("scTblDiv") && !page.body.includes("player(")) {
          console.error("  Session appears expired (no tok/player on page). Stopping — rerun with fresh PHPSESSID.");
          dead = true; break;
        }
        const mediaId = page.body.match(MEDIA_RE)?.[1] ?? null;
        if (!mediaId) { nNoDrawing++; continue; } // assembly without a drawing

        const key = `weidemann/${mediaId}.svgz`;
        const file = path.join(OUT_DIR, `${mediaId}.svgz`);
        if (!mediaOnDisk.has(mediaId) && !fs.existsSync(file)) {
          try {
            const dl = await getBuf(`https://service.weidemann.de/catalogcreator/media/${mediaId}.svgz`);
            if (dl.status === 200 && dl.buf.length > 0) {
              // Store as .svgz (gzip). Server normally sends raw gzip bytes (magic 1f8b);
              // if it sent decompressed SVG, gzip it ourselves.
              const isGzip = dl.buf[0] === 0x1f && dl.buf[1] === 0x8b;
              fs.writeFileSync(file, isGzip ? dl.buf : zlib.gzipSync(dl.buf));
              nDownloaded++;
            } else {
              console.error(`  media ${mediaId}: HTTP ${dl.status} — skipping download (key still set)`);
            }
          } catch (e) {
            console.error(`  media ${mediaId}: download error ${String(e).slice(0, 80)} — skipping`);
          }
        }
        mediaOnDisk.add(mediaId);

        const res = await prisma.diagram.updateMany({ where: { id: { in: g.ids } }, data: { diagramImageKey: key, diagramImageSourceId: mediaId } });
        nDiagramsSet += res.count;
      } catch (e) {
        console.error(`  id=${g.componentCode}: error ${String(e).slice(0, 80)} — continuing`);
      }
      await sleep(150);
    }
    if (dead) break;
    const rate = (nFetched / ((Date.now() - t0) / 1000)).toFixed(1);
    console.log(`  cumulative: ${nFetched} pages, ${nDownloaded} svgz, ${nDiagramsSet} diagrams keyed (${rate}/s)`);
  }

  await prisma.$disconnect();
  console.log("\n=== Done (or paused) ===");
  console.log(`Pages fetched:      ${nFetched}`);
  console.log(`SVGZ downloaded:    ${nDownloaded}`);
  console.log(`Diagrams keyed:     ${nDiagramsSet}`);
  console.log(`Assemblies w/o drawing: ${nNoDrawing}`);
  console.log(`Elapsed: ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
