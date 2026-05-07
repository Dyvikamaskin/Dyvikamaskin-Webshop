import { NextResponse, type NextRequest } from "next/server";
import { startWeeklyEnrichment } from "@/lib/jobs/enrich-all-products";

/**
 * POST /api/jobs/enrich-products
 *
 * Triggers the weekly product enrichment job.
 *
 * For all active products, runs:
 *   • Product-data enrichment (name/brand/desc/image) → stored as
 *     ProductEnrichmentProposal, requires admin approval before going live.
 *   • Fitment auto-suggest → stored as FitmentProposal rows.
 *
 * Returns immediately — the actual loop runs in the background.
 *
 * Protected by CRON_SECRET header.
 * Suggested Railway cron: 0 2 * * 1  (every Monday at 02:00 UTC)
 *
 * Example curl call:
 *   curl -X POST https://dyvikamaskin-webshop-production.up.railway.app/api/jobs/enrich-products \
 *        -H "x-cron-secret: $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await startWeeklyEnrichment();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[enrich-products]", error);
    return NextResponse.json(
      { error: "Job failed — see server logs." },
      { status: 500 },
    );
  }
}
