/**
 * GET /api/products/lookup?code=XXX
 *
 * Looks up a product by the given code.  Search order:
 *   1. Exact SKU match
 *   2. Exact partNumber match
 *   3. barcode in the barcodes[] array
 *
 * Returns:
 *   200 { found: true,  product: { id, sku, partNumber, name, priceBase, ... } }
 *   200 { found: false, code: "XXX" }   ← triggers enrichment flow on client
 *   400 { error: "..." }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "code parameter required" }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: {
      isActive: true,
      OR: [
        { sku:         { equals: code, mode: "insensitive" } },
        { partNumber:  { equals: code, mode: "insensitive" } },
        { barcodes:    { has: code } },
      ],
    },
    select: {
      id:              true,
      sku:             true,
      partNumber:      true,
      brand:           true,
      name:            true,
      shortDescription: true,
      priceBase:       true,
      mvaRate:         true,
      minimumOrderQuantity: true,
      mainImage:       true,
      isActive:        true,
      stock: {
        select: {
          storeId:      true,
          quantity:     true,
          locationCode: true,
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ found: false, code });
  }

  return NextResponse.json({
    found: true,
    product: {
      ...product,
      priceBase: product.priceBase.toString(),
      mvaRate:   product.mvaRate.toString(),
    },
  });
}
