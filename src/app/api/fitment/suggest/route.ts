import { type NextRequest } from "next/server";
import { searchFitments } from "@/lib/fitment-enrichment";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      productId: string;
      sku?: string;
      partNumber?: string;
      ean?: string;
      brand?: string;
      name?: string;
    };

    const proposals = await searchFitments({
      sku:        body.sku,
      partNumber: body.partNumber,
      ean:        body.ean,
      brand:      body.brand,
      name:       body.name,
    });

    // Persist fresh proposals so they survive page reloads (fire-and-forget)
    if (body.sku && proposals.length > 0) {
      const sku = body.sku;
      void (async () => {
        try {
          await prisma.$transaction([
            prisma.fitmentProposal.deleteMany({ where: { productSku: sku } }),
            prisma.fitmentProposal.createMany({
              data: proposals.map((p) => ({
                productSku:   sku,
                modelId:      p.modelId,
                confidence:   p.confidence,
                mentionCount: p.mentionCount,
                sources:      p.sources as unknown as object,
              })),
              skipDuplicates: true,
            }),
          ]);
        } catch { /* best-effort */ }
      })();
    }

    return Response.json({ ok: true, proposals });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return Response.json({ ok: false, error }, { status: 500 });
  }
}
