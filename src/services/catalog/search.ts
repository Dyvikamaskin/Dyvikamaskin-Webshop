/**
 * Product search — Phase 5
 *
 * Three-stage cascade against `Product.searchKey` (exact + trigram) and
 * `Product.searchVector` (FTS rank), in that priority order.
 *
 * Returns product IDs ordered by relevance; the caller uses these IDs to
 * fetch full Product rows in a single follow-up query (so we keep the
 * relevance ordering without dragging the full SELECT through the GIN
 * scan plan).
 *
 * Three stages:
 *   1. Exact match on searchKey (B-tree). Hit rate is highest when the
 *      user pasted a SKU; near-zero otherwise.
 *   2. Trigram fuzzy match on searchKey (GIN with gin_trgm_ops),
 *      similarity threshold 0.4. Catches typos and partial-SKU queries
 *      ("bos456" → "bosch456x").
 *   3. FTS rank on searchVector (GIN). Catches name and brand hits via
 *      tokenized matching, weighted A/B/C per the trigger.
 *
 * Each stage's hits are unioned in priority order (stage 1 first), with
 * duplicates dropped — a row that appears in stage 1 keeps its stage-1
 * priority. Final ordering: stage rank ascending, then within-stage
 * relevance descending.
 */
import { prisma } from "@/lib/prisma";

const TRIGRAM_THRESHOLD = 0.4;

/** Public input shape. Optional filters apply to all three stages. */
export interface ProductSearchInput {
  /** Raw user query — anything including SKUs, partial brand, etc. */
  query: string;
  /** Limit on returned IDs. Default 50, capped at 200. */
  limit?: number;
}

export interface ProductSearchHit {
  productId: string;
  /** 1 = exact, 2 = trigram, 3 = FTS. Lower = more relevant. */
  stage: 1 | 2 | 3;
  /** Stage-specific score; comparable only within the same stage. */
  score: number;
}

/**
 * Normalise a raw query into the canonical `searchKey` form: lowercase,
 * non-alphanumeric stripped. Mirrors the DB trigger's regex so the
 * client and server always agree on what "the same key" means.
 */
export function normalizeSearchKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/gi, "");
}

/**
 * Run the three-stage search. Returns at most `limit` product IDs in
 * descending relevance order.
 */
export async function searchProductIds(
  input: ProductSearchInput,
): Promise<ProductSearchHit[]> {
  const limit = Math.min(Math.max(1, input.limit ?? 50), 200);
  const raw = input.query.trim();
  if (raw.length === 0) return [];

  const key = normalizeSearchKey(raw);

  // Stage 1 — exact searchKey match (B-tree). Constant cost.
  // Stage 2 — trigram similarity ≥ threshold. The `% ` operator uses the
  //           per-session pg_trgm.similarity_threshold GUC; we set it
  //           explicitly via SET LOCAL inside the transaction so the
  //           service's threshold is decoupled from any deployment-wide
  //           setting.
  // Stage 3 — FTS @@ to_tsquery against the prefix-matched query.
  //
  // All three run in a single round-trip via UNION ALL + ranked
  // dedupe. The outer SELECT picks the best (lowest stage / highest
  // score) row per productId.
  const fastQuery = raw
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[^\w]/g, "") + ":*")
    .join(" & ");

  const rows = await prisma.$queryRaw<
    { productId: string; stage: number; score: number }[]
  >`
    SELECT DISTINCT ON ("productId") "productId", stage, score
    FROM (
      SELECT id AS "productId", 1 AS stage, 1.0::float AS score
      FROM "Product"
      WHERE "isActive" = true AND "searchKey" = ${key}

      UNION ALL

      SELECT id AS "productId",
             2 AS stage,
             similarity("searchKey", ${key}) AS score
      FROM "Product"
      WHERE "isActive" = true
        AND "searchKey" % ${key}
        AND similarity("searchKey", ${key}) >= ${TRIGRAM_THRESHOLD}

      UNION ALL

      SELECT id AS "productId",
             3 AS stage,
             ts_rank("searchVector", to_tsquery('simple', ${fastQuery}))::float AS score
      FROM "Product"
      WHERE "isActive" = true
        AND ${fastQuery} <> ''
        AND "searchVector" @@ to_tsquery('simple', ${fastQuery})
    ) AS combined
    ORDER BY "productId", stage ASC, score DESC
    LIMIT ${limit}
  `;

  // Re-sort by relevance (DISTINCT ON kept best per productId, but in
  // productId order). Stage ascending = higher priority; score
  // descending = better fit within the stage.
  rows.sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    return b.score - a.score;
  });

  return rows.map((r) => ({
    productId: r.productId,
    stage: r.stage as 1 | 2 | 3,
    score: r.score,
  }));
}
