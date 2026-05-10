/**
 * Product query layer — Phase 5
 *
 * All queries enforce isActive: true so soft-deleted / inactive products
 * never surface on the storefront.
 */

import { prisma } from "@/lib/prisma";
import { getCategoryDescendantIds } from "@/lib/categories";
import type {
  ProductCondition,
  PartProvenance,
} from "@/app/generated/prisma/enums";

// ─── Select shape (shared across queries) ─────────────────────────────────────

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  partNumber: true,
  brand: true,
  name: true,
  shortDescription: true,
  priceBase: true,
  mvaRate: true,
  minimumOrderQuantity: true,
  leadTimeDays: true,
  mainImage: true,
  isActive: true,
  isDiscontinued: true,
  categoryId: true,
  condition: true,
  conditionRating: true,
  conditionNotes: true,
  provenance: true,
  category: {
    select: { id: true, name: true, slug: true },
  },
  stock: {
    select: {
      storeId: true,
      quantity: true,
      lowStockThreshold: true,
      store: { select: { id: true, name: true } },
    },
  },
} as const;

// ─── Derived types ─────────────────────────────────────────────────────────────

type RawProduct = Awaited<
  ReturnType<typeof prisma.product.findUniqueOrThrow>
> extends never
  ? never
  : Awaited<
      ReturnType<
        typeof prisma.product.findUnique<{
          where: { sku: string };
          select: typeof PRODUCT_SELECT;
        }>
      >
    >;

export type StockInfo = {
  storeId: string;
  storeName: string;
  quantity: number;
  lowStockThreshold: number;
};

export type ProductWithStock = NonNullable<RawProduct> & {
  /** Aggregated quantity across all stores */
  totalStock: number;
  /** Normalised stock list (storeName instead of nested store object) */
  stockInfo: StockInfo[];
};

// ─── List options ─────────────────────────────────────────────────────────────

export interface ProductListOptions {
  /** Filter to this category and all its descendants */
  categoryId?: string;
  brand?: string;
  /** Free-text search across name, sku, partNumber, brand */
  search?: string;
  /** 1-based page number (default 1) */
  page?: number;
  /** Items per page (default 24, max 100) */
  limit?: number;
  // ── Phase 0.7 — visible filters ──────────────────────────────────
  /** One or more conditions; empty/undefined = no filter. */
  conditions?: ProductCondition[];
  /** One or more provenance values; empty/undefined = no filter. */
  provenances?: PartProvenance[];
  /** Show only products that fit a specific MachineMake (any model). */
  makeId?: string;
  /** Show only products that fit a specific MachineModel. */
  modelId?: string;
}

export interface ProductListResult {
  products: ProductWithStock[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enrichProduct(
  raw: NonNullable<
    Awaited<
      ReturnType<
        typeof prisma.product.findUnique<{
          where: { sku: string };
          select: typeof PRODUCT_SELECT;
        }>
      >
    >
  >
): ProductWithStock {
  const stockInfo: StockInfo[] = raw.stock.map((s) => ({
    storeId: s.storeId,
    storeName: s.store.name,
    quantity: s.quantity,
    lowStockThreshold: s.lowStockThreshold,
  }));
  const totalStock = stockInfo.reduce((sum, s) => sum + s.quantity, 0);
  return { ...raw, stockInfo, totalStock } as ProductWithStock;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch a single active product by SKU.
 * Returns null when the product doesn't exist or is inactive.
 */
export async function getProductBySku(
  sku: string
): Promise<ProductWithStock | null> {
  const raw = await prisma.product.findUnique({
    where: { sku, isActive: true },
    select: PRODUCT_SELECT,
  });
  return raw ? enrichProduct(raw) : null;
}

/**
 * List active products with optional category / brand / search filters.
 */
export async function listProducts(
  options: ProductListOptions = {}
): Promise<ProductListResult> {
  const {
    categoryId,
    brand,
    search,
    page = 1,
    conditions,
    provenances,
    makeId,
    modelId,
  } = options;
  const limit = Math.min(options.limit ?? 24, 100);
  const skip = (Math.max(page, 1) - 1) * limit;

  // Build WHERE clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { isActive: true };

  if (categoryId) {
    const ids = await getCategoryDescendantIds(categoryId);
    where.categoryId = { in: ids };
  }

  if (brand) {
    where.brand = brand;
  }

  // ─── Phase 5: search delegates to the catalog search service ─────
  // The service runs a three-stage query (exact → trigram → FTS) and
  // returns relevance-ordered IDs. We then apply the other filters and
  // restore the ordering after Prisma returns the rows.
  let searchOrderedIds: string[] | null = null;
  if (search) {
    const { searchProductIds } = await import("@/services/catalog/search");
    const hits = await searchProductIds({ query: search, limit: 200 });
    if (hits.length === 0) {
      return {
        products: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
      };
    }
    searchOrderedIds = hits.map((h) => h.productId);
    where.id = { in: searchOrderedIds };
  }

  // ── Phase 0.7 filters ────────────────────────────────────────────
  if (conditions && conditions.length > 0) {
    where.condition = { in: conditions };
  }
  if (provenances && provenances.length > 0) {
    where.provenance = { in: provenances };
  }
  if (modelId) {
    // Restrict to products that have a fitment to this model.
    where.fitments = { some: { modelId } };
  } else if (makeId) {
    // Restrict to products that have a fitment to ANY model under this make.
    where.fitments = { some: { model: { makeId } } };
  }

  const [total, raws] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: PRODUCT_SELECT,
      // When search is active, ordering by brand/name would scramble
      // relevance — sort below in JS using the search-service ordering.
      // Without search we keep the catalog default.
      orderBy: searchOrderedIds ? undefined : [{ brand: "asc" }, { name: "asc" }],
      skip: searchOrderedIds ? undefined : skip,
      take: searchOrderedIds ? undefined : limit,
    }),
  ]);

  let ordered = raws;
  if (searchOrderedIds) {
    const rank = new Map(searchOrderedIds.map((id, i) => [id, i]));
    ordered = [...raws].sort(
      (a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9),
    );
    // Apply pagination AFTER sorting by relevance.
    ordered = ordered.slice(skip, skip + limit);
  }

  return {
    products: ordered.map(enrichProduct),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Return distinct brand names for the filter sidebar.
 */
export async function getActiveBrands(
  categoryId?: string
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { isActive: true, brand: { not: null } };

  if (categoryId) {
    const ids = await getCategoryDescendantIds(categoryId);
    where.categoryId = { in: ids };
  }

  const rows = await prisma.product.findMany({
    where,
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });

  return rows.map((r) => r.brand!).filter(Boolean);
}

/**
 * Aggregate stock quantity for a product.
 * Pass storeId to restrict to a single store.
 */
export async function getProductStock(
  productId: string,
  storeId?: string
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { productId };
  if (storeId) where.storeId = storeId;

  const rows = await prisma.storeStock.findMany({
    where,
    select: { quantity: true },
  });
  return rows.reduce((sum, s) => sum + s.quantity, 0);
}
