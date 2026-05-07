/**
 * Weekly product enrichment job.
 *
 * For every active, non-discontinued product:
 *   1. Run product-data enrichment (DDG + Icecat + Wikidata) → stored as
 *      ProductEnrichmentProposal (requires admin approval before going live)
 *   2. Run fitment enrichment (web search + model matching) → stored as
 *      FitmentProposal rows (admin accepts/ignores on the edit page)
 *
 * Processing is sequential with a 1-second gap between products to be
 * polite to free external APIs.
 *
 * Called from /api/jobs/enrich-products (protected by CRON_SECRET).
 * Suggested Railway cron schedule: 0 2 * * 1  (Mondays at 02:00 UTC)
 */

import { prisma } from "@/lib/prisma";
import { enrichProductDirectly } from "@/lib/product-enrichment";
import { runFitmentEnrichmentForProduct } from "@/lib/fitment-enrichment";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichAllResult {
  queued:  number;
  message: string;
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Counts active products, fires the enrichment loop in the background,
 * and returns immediately so the HTTP response is not blocked.
 */
export async function startWeeklyEnrichment(): Promise<EnrichAllResult> {
  const products = await prisma.product.findMany({
    where:   { isActive: true, isDiscontinued: false },
    select:  { sku: true },
    orderBy: { updatedAt: "asc" }, // least recently updated first
  });

  if (products.length === 0) {
    return { queued: 0, message: "No active products to enrich." };
  }

  // Fire-and-forget — the loop keeps running after the HTTP response returns.
  void runEnrichmentLoop(products.map((p) => p.sku));

  return {
    queued:  products.length,
    message: `Enrichment loop started for ${products.length} products (background).`,
  };
}

// ─── Background loop ──────────────────────────────────────────────────────────

async function runEnrichmentLoop(skus: string[]): Promise<void> {
  for (const sku of skus) {
    // Run both pipelines in parallel per product, but products are sequential
    await Promise.allSettled([
      enrichProductDirectly(sku),
      runFitmentEnrichmentForProduct(sku),
    ]);

    // 1-second pause between products — free APIs have rate limits
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
}
