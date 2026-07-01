/**
 * 01-avspare-walk.ts — Hitachi parts walker (AVSpare "Hitachi HOP" mirror)
 *
 * ⚠️ PROVENANCE: avspare.com is an unaffiliated third-party MIRROR of Hitachi's
 * proprietary EPC ("for reference only" per their own disclaimer). Fine as an
 * internal lookup; treat as IP-gray for anything public-facing.
 *
 * TRANSPORT: the canonical /catalog/ pages are server-rendered HTML and allowed
 * by robots.txt (robots blocks /search/, /api/, and named scraper bots). We are
 * a POLITE client only: real browser UA, fixed delay between requests, honor
 * back-off on 410/429/403. We do NOT rotate identities / evade blocks — if the
 * site blocks us we pause and stop, and the run resumes later.
 *
 * Hierarchy:
 *   family page  /catalog/hitachi/{family}/                → variants
 *   variant page /catalog/hitachi/{code:model}/            → catalog books (UUID)
 *   book page    /catalog/hitachi/{code:model}/{bookUuid}/ → assembly groups (UUID)
 *   group leaf   /catalog/hitachi/{code:model}/{grpUuid}/  → part table + diagram PNG
 *
 * Books are shared across variants (e.g. ZX210W-3 CJA/CJB/CJD/CKB share one book),
 * so we dedupe by book UUID and walk each book once. Output: one JSONL per book in
 * data/hitachi_raw/ (resume-safe: existing book files are skipped) + _variants.json
 * mapping each variant → its books.
 *
 * Usage:
 *   npx tsx scripts/oem-ingest/hitachi/01-avspare-walk.ts [--family=zx210] [--variant=cjb:zx210w-3] [--limit-variants=N] [--delay=1200]
 */

import * as fs from "fs";
import * as path from "path";

const BASE = "https://avspare.com";
const FAMILY = (process.argv.find((a) => a.startsWith("--family=")) ?? "--family=zx210").split("=")[1];
const ONLY_VARIANT = process.argv.find((a) => a.startsWith("--variant="))?.split("=")[1] ?? null;
const LIMIT_VARIANTS = (() => { const a = process.argv.find((x) => x.startsWith("--limit-variants=")); return a ? parseInt(a.split("=")[1]) : Infinity; })();
const DELAY = (() => { const a = process.argv.find((x) => x.startsWith("--delay=")); return a ? parseInt(a.split("=")[1]) : 1200; })();
const OUT_DIR = path.resolve("data/hitachi_raw");
fs.mkdirSync(OUT_DIR, { recursive: true });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").trim();
const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url: string, tries = 0): Promise<string> {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": "identity",
      referer: BASE + "/catalog/hitachi/",
    },
  });
  if (r.status === 200) return r.text();
  if ([403, 410, 429, 503].includes(r.status)) {
    if (tries >= 1) throw new Error(`BLOCKED: HTTP ${r.status} on ${url} (after back-off). Stopping — rerun later to resume.`);
    console.warn(`  ⚠ HTTP ${r.status} — backing off 60s then one retry…`);
    await sleep(60_000);
    return get(url, tries + 1);
  }
  throw new Error(`HTTP ${r.status} on ${url}`);
}

type Book = { uuid: string; title: string; code: string; section: string; models: string[] };
type Part = { pos: string; partNumber: string; qty: number | null; name: string; comments: string };

// Variants on the family page: links like /catalog/hitachi/cjb:zx210w-3/
function parseVariants(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="\/catalog\/hitachi\/([a-z0-9]+:[a-z0-9._-]+)\/"/g)) out.add(m[1]);
  return [...out];
}

// Books on a variant page: grouped under <h3>Section</h3> ... list of book links.
function parseBooks(html: string, variant: string): Book[] {
  const books: Book[] = [];
  const linkRe = new RegExp(`<h3>([^<]+)</h3>([\\s\\S]*?)(?=<h3>|$)`, "g");
  let sec;
  while ((sec = linkRe.exec(html)) !== null) {
    const section = clean(sec[1]);
    const block = sec[2];
    const bookRe = new RegExp(`href="/catalog/hitachi/${variant.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}/(${UUID})/"[^>]*>([\\s\\S]*?)</a>([\\s\\S]*?)(?=<li|</ul>)`, "g");
    let b;
    while ((b = bookRe.exec(block)) !== null) {
      const title = clean(b[2]);
      const badges = [...b[3].matchAll(/<span class="badge[^"]*">([\s\S]*?)<\/span>/g)].map((x) => clean(x[1]));
      const code = badges.find((x) => /^[A-Z0-9-]+$/.test(x.replace(/\s/g, ""))) ?? "";
      // models from title, e.g. "* ZX210W-3,ZX210W-3-AMS,ZX220W-3 Wheeled Excavator PARTS CATALOG"
      const models = (title.match(/[A-Z]{1,3}[0-9]{2,4}[A-Z0-9-]*/g) ?? []).filter((m, i, a) => a.indexOf(m) === i);
      books.push({ uuid: b[1], title, code, section, models });
    }
  }
  return books;
}

// Assembly groups on a book page: cards linking to group leaves.
function parseGroups(html: string, variant: string): { uuid: string; name: string }[] {
  const out: { uuid: string; name: string }[] = [];
  const seen = new Set<string>();
  const re = new RegExp(`href="/catalog/hitachi/${variant.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}/(${UUID})/"[^>]*>([\\s\\S]*?)</a>`, "g");
  let m;
  while ((m = re.exec(html)) !== null) {
    const uuid = m[1];
    const name = clean(m[2]);
    if (!name || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push({ uuid, name });
  }
  return out;
}

// Part table + diagram image on a group leaf.
function parseLeaf(html: string): { image: string | null; parts: Part[]; truncated: boolean } {
  const image = html.match(/href="(\/\/c1\.a2109\.com\/hitachi\/[^"]+\.png)"/)?.[1] ?? null;
  const truncated = /For full view, you need\s*<a[^>]*>register/i.test(html) && !/Parts on group/i.test(html);
  const parts: Part[] = [];
  const tableM = html.match(/Parts on group[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (tableM) {
    for (const row of tableM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const tds = [...row[1].matchAll(/<td[^>]*data-title="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)];
      const cell = (title: RegExp) => tds.find((t) => title.test(t[1]))?.[2] ?? "";
      const partNumber = (cell(/Part\s*№|Part No/i).match(/\/spare\/hitachi\/([^/"]+)\//) ?? [])[1] ?? clean(cell(/Part\s*№|Part No/i));
      if (!partNumber) continue;
      const qtyRaw = clean(cell(/Qty/i)).replace(/[^0-9]/g, "");
      const commentsCell = cell(/Comments/i);
      const comment = (commentsCell.match(/<span\s*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "";
      parts.push({
        pos: clean(cell(/Pos/i)),
        partNumber,
        qty: qtyRaw ? parseInt(qtyRaw) : null,
        name: clean(cell(/Part name/i)),
        comments: decode(comment).replace(/<BR>/gi, "; ").trim(),
      });
    }
  }
  return { image, parts, truncated };
}

async function main() {
  console.log(`Hitachi AVSpare walk — family=${FAMILY}${ONLY_VARIANT ? ` variant=${ONLY_VARIANT}` : ""} delay=${DELAY}ms`);
  console.log(`PROVENANCE: third-party mirror of Hitachi EPC — internal reference use.\n`);

  let variants: string[];
  if (ONLY_VARIANT) {
    variants = [ONLY_VARIANT];
  } else {
    const fam = await get(`${BASE}/catalog/hitachi/${FAMILY}/`);
    await sleep(DELAY);
    variants = parseVariants(fam).filter((v) => v.includes(FAMILY));
  }
  if (LIMIT_VARIANTS !== Infinity) variants = variants.slice(0, LIMIT_VARIANTS);
  console.log(`Variants: ${variants.length}`);

  const variantIndex: Record<string, { books: Book[] }> = {};
  const seenBooks = new Set<string>();
  let nBooks = 0, nGroups = 0, nParts = 0;
  const t0 = Date.now();

  try {
    for (const variant of variants) {
      const vhtml = await get(`${BASE}/catalog/hitachi/${variant}/`);
      await sleep(DELAY);
      const books = parseBooks(vhtml, variant);
      variantIndex[variant] = { books };
      console.log(`\n▸ ${variant}: ${books.length} books`);

      for (const book of books) {
        if (seenBooks.has(book.uuid)) { console.log(`    book ${book.code || book.uuid.slice(0, 8)}: shared — already walked`); continue; }
        seenBooks.add(book.uuid);
        const outFile = path.join(OUT_DIR, `book_${book.uuid}.jsonl`);
        if (fs.existsSync(outFile)) { console.log(`    book ${book.code || book.uuid.slice(0, 8)}: file exists — skipping`); nBooks++; continue; }

        const bhtml = await get(`${BASE}/catalog/hitachi/${variant}/${book.uuid}/`);
        await sleep(DELAY);
        const groups = parseGroups(bhtml, variant);
        console.log(`    book ${book.code || book.uuid.slice(0, 8)} "${book.title.slice(0, 50)}": ${groups.length} groups`);

        const lines: string[] = [];
        for (const g of groups) {
          const lhtml = await get(`${BASE}/catalog/hitachi/${variant}/${g.uuid}/`);
          await sleep(DELAY);
          const leaf = parseLeaf(lhtml);
          if (leaf.truncated) console.warn(`      ⚠ group "${g.name}" appears gated/truncated`);
          lines.push(JSON.stringify({
            brand: "Hitachi", family: FAMILY, variant, book: book.title, bookCode: book.code,
            bookUuid: book.uuid, section: book.section, models: book.models,
            group: g.name, groupUuid: g.uuid, imageUrl: leaf.image, parts: leaf.parts,
          }));
          nGroups++; nParts += leaf.parts.length;
        }
        fs.writeFileSync(outFile, lines.join("\n") + "\n");
        nBooks++;
        console.log(`      → ${path.basename(outFile)} (${groups.length} groups, ${lines.length} written)`);
      }
    }
  } catch (e) {
    console.error(`\n✖ ${String(e)}`);
    console.error("Progress saved (completed book files persist). Rerun to resume.");
  }

  fs.writeFileSync(path.join(OUT_DIR, "_variants.json"), JSON.stringify(variantIndex, null, 2));
  console.log(`\n=== ${Date.now() - t0 > 0 ? "Done/paused" : "Done"} ===`);
  console.log(`Variants: ${Object.keys(variantIndex).length}  Books: ${nBooks}  Groups: ${nGroups}  Parts: ${nParts}`);
  console.log(`Elapsed: ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
