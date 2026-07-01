/**
 * 02-crawl-avspare.ts
 *
 * Crawls avspare.com by scraping server-rendered HTML pages.
 * New site structure (post June 2026):
 *   /catalog/{make}/                            → list of variants
 *   /catalog/{make}/{variant}/                  → list of books → list of groups
 *   /catalog/{make}/{variant}/{bookId}/         → list of groups with links
 *   /catalog/{make}/{variant}/{groupId}/        → parts table for that group
 *
 * Resume-safe: loads existing JSONL checkpoint, skips already-captured groupIds.
 * Rate-limited to ~30 req/min (2s delay).
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/avspare/02-crawl-avspare.ts
 *   npx tsx scripts/oem-ingest/avspare/02-crawl-avspare.ts --make=hitachi --model=zx210
 *
 * Output: ~/Downloads/{make}_{model}_parts.jsonl (appended)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";

const MAKE  = process.argv.find(a => a.startsWith("--make="))?.split("=")[1]  ?? "hitachi";
const MODEL = process.argv.find(a => a.startsWith("--model="))?.split("=")[1] ?? "zx210";
const BASE  = "https://avspare.com";
const DELAY = 2000;
const OUT_FILE = path.join(os.homedir(), "Downloads", `${MAKE}_${MODEL}_parts.jsonl`);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// Extract href matches from HTML — no DOM parser needed
function extractLinks(html: string, pattern: RegExp): string[] {
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) links.push(m[1]);
  return [...new Set(links)];
}

// Parse parts table from group page HTML
function parseParts(html: string): { pos: string; partNumber: string; qty: number; name: string; comments: string }[] {
  const parts: { pos: string; partNumber: string; qty: number; name: string; comments: string }[] = [];
  // Parts appear in <tr> rows with callout, partNumber, qty, name
  // Pattern: <tr ...><td>pos</td><td>partNo</td><td>qty</td><td>name</td>...
  const rowRe = /<tr[^>]*>\s*(<td[^>]*>[\s\S]*?)<\/tr>/gi;
  let rowM: RegExpExecArray | null;
  while ((rowM = rowRe.exec(html)) !== null) {
    const row = rowM[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, "").trim());
    if (cells.length >= 4 && /^\d/.test(cells[1])) {
      parts.push({
        pos: cells[0],
        partNumber: cells[1],
        qty: parseInt(cells[2]) || 1,
        name: cells[3],
        comments: cells[4] ?? "",
      });
    }
  }
  return parts;
}

// Extract image URL from group page
function parseImageUrl(html: string): string | null {
  const m = html.match(/src="(https?:\/\/[^"]*a2109\.com[^"]+\.(?:png|jpg|jpeg|webp))"/i)
    ?? html.match(/src="(\/\/[^"]*a2109\.com[^"]+\.(?:png|jpg|jpeg|webp))"/i);
  return m ? (m[1].startsWith("//") ? "https:" + m[1] : m[1]) : null;
}

async function loadCheckpoint(): Promise<Set<string>> {
  const seen = new Set<string>();
  if (!fs.existsSync(OUT_FILE)) return seen;
  const rl = readline.createInterface({ input: fs.createReadStream(OUT_FILE) });
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.groupUuid) seen.add(obj.groupUuid);
    } catch {}
  }
  console.log(`Checkpoint: ${seen.size} groups already written`);
  return seen;
}

function writeLine(obj: object) {
  fs.appendFileSync(OUT_FILE, JSON.stringify(obj) + "\n");
}

async function main() {
  console.log(`Crawling ${BASE}/catalog/${MAKE}/ for model ${MODEL}`);
  console.log(`Output: ${OUT_FILE}`);

  const seen = await loadCheckpoint();

  // 1. Variant list page
  await sleep(DELAY);
  const modelHtml = await getHtml(`${BASE}/catalog/${MAKE}/${MODEL}/`);

  // Extract variant links: /catalog/hitachi/bde:zx210-3-ams/
  const variantPattern = new RegExp(`href="(/catalog/${MAKE}/[^/"]+/)"`, "gi");
  const variantPaths = extractLinks(modelHtml, variantPattern)
    .filter(p => p !== `/catalog/${MAKE}/` && !p.includes(MODEL + "/") === false);

  // Filter to only variants that include the model name
  const modelVariants = variantPaths.filter(p => p.toLowerCase().includes(MODEL.replace(/[^a-z0-9]/gi, "")));
  console.log(`Variants found: ${modelVariants.length}`);

  let totalGroups = 0;
  let skipped = 0;

  for (const variantPath of modelVariants) {
    const variantSlug = variantPath.split("/").filter(Boolean).pop()!;
    await sleep(DELAY);
    let variantHtml: string;
    try { variantHtml = await getHtml(`${BASE}${variantPath}`); }
    catch (e: any) { console.warn(`  [skip variant ${variantSlug}] ${e.message}`); continue; }

    // Extract book links from variant page: /catalog/hitachi/bde:zx210-3-ams/{uuid}/
    const uuidPattern = new RegExp(`href="(/catalog/${MAKE}/${variantSlug.replace(/:/g, "\\:")}/([0-9a-f-]{36})/)(?:"|#)`, "gi");
    const bookPaths = extractLinks(variantHtml, new RegExp(`href="(/catalog/${MAKE}/${variantSlug.replace(/:/g, "\\:")}/[0-9a-f-]{36}/)(?:"|#)`, "gi"));

    // Extract book names from variant page text
    const bookNames = new Map<string, string>();
    const bookNameRe = new RegExp(`href="(/catalog/${MAKE}/${variantSlug.replace(/:/g, "\\:")}/([0-9a-f-]{36})/?)"[^>]*>([^<]+)<`, "gi");
    let bnm: RegExpExecArray | null;
    while ((bnm = bookNameRe.exec(variantHtml)) !== null) {
      bookNames.set(bnm[2], bnm[3].trim());
    }

    console.log(`\nVariant: ${variantSlug} — ${bookPaths.length} books`);

    for (const bookPath of bookPaths) {
      const bookId = bookPath.split("/").filter(Boolean).pop()!;
      const bookName = bookNames.get(bookId) ?? bookId;

      await sleep(DELAY);
      let bookHtml: string;
      try { bookHtml = await getHtml(`${BASE}${bookPath}`); }
      catch (e: any) { console.warn(`  [skip book ${bookId}] ${e.message}`); continue; }

      // Extract group links from book page
      const groupPattern = new RegExp(`href="(/catalog/${MAKE}/${variantSlug.replace(/:/g, "\\:")}/([0-9a-f-]{36})/)(?:"|#)`, "gi");
      const groupPaths = extractLinks(bookHtml, new RegExp(`href="(/catalog/${MAKE}/${variantSlug.replace(/:/g, "\\:")}/([0-9a-f-]{36})/)(?:"|#)`, "gi"))
        .filter(p => p !== bookPath); // exclude self

      // Extract group names
      const groupNames = new Map<string, string>();
      const groupNameRe = new RegExp(`href="(/catalog/${MAKE}/${variantSlug.replace(/:/g, "\\:")}/([0-9a-f-]{36})/?)"[^>]*>([^<]+)<`, "gi");
      let gnm: RegExpExecArray | null;
      while ((gnm = groupNameRe.exec(bookHtml)) !== null) {
        if (gnm[1] !== bookPath) groupNames.set(gnm[2], gnm[3].trim());
      }

      console.log(`  Book: ${bookName} — ${groupPaths.length} groups`);

      for (const groupPath of groupPaths) {
        const groupId = groupPath.split("/").filter(Boolean).pop()!;
        if (seen.has(groupId)) { skipped++; continue; }

        await sleep(DELAY);
        let groupHtml: string;
        try { groupHtml = await getHtml(`${BASE}${groupPath}`); }
        catch (e: any) { console.warn(`    [skip group ${groupId}] ${e.message}`); continue; }

        const parts = parseParts(groupHtml);
        const imageUrl = parseImageUrl(groupHtml);
        const groupName = groupNames.get(groupId) ?? groupId;

        writeLine({
          brand: MAKE.charAt(0).toUpperCase() + MAKE.slice(1),
          family: MODEL,
          variant: variantSlug,
          book: bookName,
          bookUuid: bookId,
          section: "",
          models: [],
          group: groupName,
          groupUuid: groupId,
          imageUrl,
          parts,
        });

        seen.add(groupId);
        totalGroups++;
        process.stdout.write(`\r    ${totalGroups} groups written (${skipped} skipped)`);
      }
    }
  }

  console.log(`\n\n=== Done ===`);
  console.log(`  Groups written: ${totalGroups}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Output:         ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
