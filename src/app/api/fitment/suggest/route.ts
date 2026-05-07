import { type NextRequest } from "next/server";
import { searchFitments } from "@/lib/fitment-enrichment";

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

    return Response.json({ ok: true, proposals });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return Response.json({ ok: false, error }, { status: 500 });
  }
}
