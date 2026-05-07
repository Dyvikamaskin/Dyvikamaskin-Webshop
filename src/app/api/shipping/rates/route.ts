import { NextResponse, type NextRequest } from "next/server";
import { fetchShippingRates } from "@/lib/mybring";

/**
 * POST /api/shipping/rates
 *
 * Returns available Bring shipping products with prices for a given parcel.
 * No auth required — this is called from checkout to show shipping options.
 *
 * Body:
 * {
 *   fromPostalCode: string;   // sender / store postal code
 *   toPostalCode:   string;   // recipient postal code
 *   weightInGrams:  number;   // total package weight
 *   shippingDate?:  string;   // "YYYY-MM-DD", defaults to today
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    fromPostalCode?: string;
    toPostalCode?: string;
    weightInGrams?: number;
    shippingDate?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const { fromPostalCode, toPostalCode, weightInGrams } = body;

  if (!fromPostalCode || !toPostalCode || !weightInGrams) {
    return NextResponse.json(
      { error: "fromPostalCode, toPostalCode og weightInGrams er påkrevd" },
      { status: 400 }
    );
  }

  try {
    const results = await fetchShippingRates({
      fromPostalCode,
      toPostalCode,
      weightInGrams,
      shippingDate: body.shippingDate,
    });

    // Flatten to a simple product list (one consignment in → one list out)
    const products = results.flatMap((r) => r.products);

    return NextResponse.json({ products });
  } catch (err) {
    console.error("[shipping/rates]", err);
    const message = err instanceof Error ? err.message : "Ukjent feil";
    // If env vars are missing (not yet configured), return empty gracefully
    if (message.includes("Missing env var")) {
      return NextResponse.json({ products: [] });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
