/**
 * browser-crawler.js — paste into Chrome DevTools console on avspare.com
 *
 * Rate-limited (500ms between requests), checkpoint-aware (skips groups
 * already in the output). Downloads remaining ZX210 groups.
 *
 * To use:
 *   1. Open https://avspare.com/catalog/hitachi/zx210/ in Chrome
 *   2. Open DevTools → Console
 *   3. Paste and run this script
 *   4. When done, run:  copy(window._avspare_output.join('\n'))
 *      then paste into ~/Downloads/hitachi_zx210_parts.jsonl (append)
 *
 * Already-captured groups (from the partial JSONL) are skipped automatically.
 */
(async () => {
  const MAKE = 'hitachi';
  const MODEL = 'zx210';
  const BASE = 'https://avspare.com/api/catalog';
  const DELAY = 500; // ms between requests

  // Groups already captured — paste the groupUuids from the existing JSONL here
  // (script will skip these automatically by checking window._avspare_seen)
  // Leave empty to re-fetch everything (idempotent — just slower)
  const SEEN_GROUPS = new Set(window._avspare_seen || []);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const get = async url => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  };

  window._avspare_output = window._avspare_output || [];
  let total = 0, skipped = 0;

  console.log('Fetching variants...');
  await sleep(DELAY);
  const variants = await get(`${BASE}/models?make=${MAKE}&model=${MODEL}`);
  console.log(`Variants: ${variants.length}`);

  // Collect unique books across all variants
  const bookMap = new Map();
  for (const v of variants) {
    await sleep(DELAY);
    let books;
    try { books = await get(`${BASE}/books?make=${MAKE}&model=${MODEL}&variant=${v.slug}`); }
    catch (e) { console.warn(`Skip variant ${v.slug}: ${e.message}`); continue; }
    for (const b of books) {
      if (!bookMap.has(b.id)) bookMap.set(b.id, { ...b, variantSlugs: [] });
      bookMap.get(b.id).variantSlugs.push(v.slug);
    }
  }
  console.log(`Unique books: ${bookMap.size}`);

  for (const [bookId, book] of bookMap) {
    const variantSlug = book.variantSlugs[0];
    await sleep(DELAY);
    let groups;
    try { groups = await get(`${BASE}/groups?make=${MAKE}&model=${MODEL}&variant=${variantSlug}&book=${bookId}`); }
    catch (e) { console.warn(`Skip book ${bookId}: ${e.message}`); continue; }
    console.log(`Book: ${book.name} — ${groups.length} groups`);

    for (const g of groups) {
      if (SEEN_GROUPS.has(g.id)) { skipped++; continue; }
      await sleep(DELAY);
      let detail;
      try { detail = await get(`${BASE}/parts?make=${MAKE}&model=${MODEL}&variant=${variantSlug}&book=${bookId}&group=${g.id}`); }
      catch (e) { console.warn(`  Skip group ${g.id}: ${e.message}`); continue; }

      const line = JSON.stringify({
        brand: 'Hitachi', family: MODEL, variant: variantSlug,
        book: book.name, bookUuid: bookId, section: book.section,
        models: book.models, group: g.name, groupUuid: g.id,
        imageUrl: detail.imageUrl || null, parts: detail.parts || [],
      });
      window._avspare_output.push(line);
      SEEN_GROUPS.add(g.id);
      total++;
      if (total % 20 === 0) console.log(`  ${total} groups, ${window._avspare_output.length} total in buffer`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`New groups: ${total}, skipped: ${skipped}`);
  console.log(`\nRun this to copy output to clipboard:`);
  console.log(`  copy(window._avspare_output.join('\\n'))`);
  console.log(`Then append to ~/Downloads/hitachi_zx210_parts.jsonl`);
})();
