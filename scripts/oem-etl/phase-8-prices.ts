/**
 * Phase 8 — Move PartPriceSnapshot → PartPriceSnapshot.
 *
 * Resolves partId where possible; leaves NULL when the partNumber isn't yet
 * in the canonical catalog (we keep the snapshot row anyway because that's
 * exactly when we want to know which retailers carry something we don't).
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

  const started = Date.now();
  console.log("[phase 8] streaming PartPriceSnapshot ...");

  let written = 0;
  await withClient(PROD_URL, async (prod) => {
    await withClient(OEM_URL, async (oem) => {
      await oem.query(`TRUNCATE "PartPriceSnapshot" RESTART IDENTITY CASCADE`);
      const PAGE = 20_000;
      let lastId: string | null = null;
      const grand = parseInt(
        (await prod.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "PartPriceSnapshot"`,
        )).rows[0]!.count,
        10,
      );
      console.log(`  total snapshots: ${grand.toLocaleString()}`);

      while (true) {
        const q = lastId
          ? `SELECT id, "partNumber", "retailer", "currency", "price",
                    "productName", "productUrl", "imageUrl", "isCallForPrice", "scrapedAt"
             FROM "PartPriceSnapshot" WHERE id > $1 ORDER BY id ASC LIMIT $2`
          : `SELECT id, "partNumber", "retailer", "currency", "price",
                    "productName", "productUrl", "imageUrl", "isCallForPrice", "scrapedAt"
             FROM "PartPriceSnapshot" ORDER BY id ASC LIMIT $1`;
        const params = lastId ? [lastId, PAGE] : [PAGE];
        const res = await prod.query<{
          id: string;
          partNumber: string;
          retailer: string;
          currency: string;
          price: string | null;
          productName: string | null;
          productUrl: string | null;
          imageUrl: string | null;
          isCallForPrice: boolean;
          scrapedAt: Date;
        }>(q, params);
        if (res.rows.length === 0) break;

        for (const sub of chunk(res.rows, 2000)) {
          const placeholders: string[] = [];
          const values: unknown[] = [];
          sub.forEach((r, i) => {
            const base = i * 11;
            placeholders.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
                `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`,
            );
            values.push(
              newId(),
              r.partNumber,
              partMap[r.partNumber] ?? null,
              r.retailer,
              r.currency,
              r.price,
              r.productName,
              r.productUrl,
              r.imageUrl,
              r.isCallForPrice,
              r.scrapedAt,
            );
          });
          await oem.query(
            `INSERT INTO "PartPriceSnapshot"
               ("id", "partNumber", "partId", "retailer", "currency", "price",
                "productName", "productUrl", "imageUrl", "isCallForPrice", "scrapedAt")
             VALUES ${placeholders.join(", ")}`,
            values,
          );
        }
        written += res.rows.length;
        lastId = res.rows[res.rows.length - 1]!.id;
        if (written % 50_000 === 0 || res.rows.length < PAGE) {
          logProgress("PartPriceSnapshot write", written, grand, started);
        }
      }
    });
  });

  console.log(`\n✓ phase 8 done — ${written.toLocaleString()} PartPriceSnapshot rows.`);
}

main().catch((e) => {
  console.error("phase 8 failed:", e);
  process.exit(1);
});
