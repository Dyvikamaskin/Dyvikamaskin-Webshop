/**
 * Phase 7 — Move OemPartListing → PartListing.
 */
import {
  PROD_URL,
  OEM_URL,
  withClient,
  loadJson,
  chunk,
  logProgress,
  newId,
} from "./shared";

async function main() {
  if (!PROD_URL) throw new Error("DIRECT_URL not set");
  if (!OEM_URL) throw new Error("OEM_DIRECT_URL not set");

  const partMap = loadJson<Record<string, string>>("part-id-map.json", {});
  if (Object.keys(partMap).length === 0) throw new Error("part-id-map.json missing");

  const started = Date.now();
  console.log("[phase 7] reading OemPartListing ...");

  // Prod schema fields (from prisma/schema.prisma):
  //   partNumber, source, title, description, descriptionHtml, productType,
  //   weightGrams, barcode, replacesPartNumbers, imageUrls, primaryImageUrl,
  //   imageCount, sourceProductId, sourceUrl, sourceCreatedAt, sourceUpdatedAt,
  //   price, currency, scrapedAt
  type Row = {
    id: string;
    partNumber: string;
    source: string;
    title: string;
    description: string | null;
    imageUrls: string[] | null;
    replacesPartNumbers: string[] | null;
    sourceUrl: string | null;
    sourceProductId: string | null;
    price: string | null;
    currency: string | null;
    scrapedAt: Date;
  };
  let rows: Row[] = [];
  await withClient(PROD_URL, async (prod) => {
    const res = await prod.query<Row>(
      `SELECT id, "partNumber", "source", "title", "description",
              "imageUrls", "replacesPartNumbers",
              "sourceUrl", "sourceProductId", "price", "currency", "scrapedAt"
       FROM "OemPartListing" ORDER BY id ASC`,
    );
    rows = res.rows;
  });
  console.log(`  ✓ ${rows.length.toLocaleString()} listing rows`);

  // Map source string → ListingSource enum
  const SOURCE_REMAP: Record<string, string> = {
    "neyer-en": "NEYER_EN",
    "neyer-de": "NEYER_DE",
    "neyer_en": "NEYER_EN",
    "neyer_de": "NEYER_DE",
    "lsengineers": "LSENGINEERS",
    "weidemann": "WEIDEMANN_ESERVICE",
    "weidemann_eservice": "WEIDEMANN_ESERVICE",
  };

  let written = 0;
  let skipped = 0;
  await withClient(OEM_URL, async (oem) => {
    await oem.query(`TRUNCATE "PartListing" RESTART IDENTITY CASCADE`);
    for (const batch of chunk(rows, 1000)) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let bi = 0;
      const seen = new Set<string>();
      for (const r of batch) {
        const partId = partMap[r.partNumber];
        if (!partId) {
          skipped++;
          continue;
        }
        const sourceRaw = (r.source ?? "other").toLowerCase();
        const source = SOURCE_REMAP[sourceRaw] ?? "OTHER";
        // Prod's external identifier is sourceProductId; fall back to partNumber.
        const externalSku = r.sourceProductId ?? r.partNumber;
        const externalUrl = r.sourceUrl ?? "";
        const dedupKey = `${source}|${externalSku}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const base = bi * 13;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}::"ListingSource", $${base + 4}, $${base + 5}, ` +
            `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, ` +
            `$${base + 11}, $${base + 12}, $${base + 13})`,
        );
        // imageUrls is stored as Json on the new side. Prod's column is text[]
        // which pg returns as a JS array — serialise so Postgres gets valid JSON.
        const imageUrlsJson = JSON.stringify(r.imageUrls ?? []);
        values.push(
          newId(),                                 // $1 id
          partId,                                  // $2 partId
          source,                                  // $3 source (enum)
          externalSku,                             // $4 externalSku
          externalUrl,                             // $5 externalUrl
          r.title ?? null,                         // $6 title
          r.description ?? null,                   // $7 description
          imageUrlsJson,                           // $8 imageUrls
          r.price ?? null,                         // $9 priceText
          r.price ?? null,                         // $10 priceAmount
          null,                                    // $11 leadTime — not in prod
          r.replacesPartNumbers ?? [],             // $12 replacesOem (stays as text[])
          r.scrapedAt,                             // $13 scrapedAt
        );
        bi++;
      }
      if (placeholders.length === 0) continue;
      const sql = `
        INSERT INTO "PartListing"
          ("id", "partId", "source", "externalSku", "externalUrl",
           "title", "description", "imageUrls", "priceText", "priceAmount",
           "leadTime", "replacesOem", "scrapedAt")
        VALUES ${placeholders.join(", ")}
        ON CONFLICT ("source", "externalSku") DO NOTHING
      `;
      await oem.query(sql, values);
      written += placeholders.length;
    }
    logProgress("PartListing write", written, rows.length, started);
    console.log(`  ⚠ ${skipped} skipped (no matching part)`);
  });

  console.log(`\n✓ phase 7 done — ${written.toLocaleString()} PartListing rows.`);
}

main().catch((e) => {
  console.error("phase 7 failed:", e);
  process.exit(1);
});
