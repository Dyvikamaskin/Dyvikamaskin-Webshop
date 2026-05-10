import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchProductIds } from "@/services/catalog/search";

/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Autocomplete endpoint for the storefront search bar (Phase 5).
 * Returns the top N products in relevance order, with just the fields
 * the dropdown UI needs. Cached on the edge for 60s with stale-while-
 * revalidate so popular queries don't keep slamming the DB.
 */

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const query = (sp.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(1, parseInt(sp.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  if (query.length < 2) {
    return NextResponse.json({ query, results: [] }, { headers: { "Cache-Control": CACHE_HEADER } });
  }

  const hits = await searchProductIds({ query, limit });
  if (hits.length === 0) {
    return NextResponse.json({ query, results: [] }, { headers: { "Cache-Control": CACHE_HEADER } });
  }

  const ids = hits.map((h) => h.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      mainImage: true,
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const results = hits
    .map((h) => byId.get(h.productId))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      mainImage: p.mainImage,
      href: `/produkter/${encodeURIComponent(p.sku)}`,
    }));

  return NextResponse.json(
    { query, results },
    { headers: { "Cache-Control": CACHE_HEADER } },
  );
}
