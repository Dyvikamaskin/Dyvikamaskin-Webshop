/**
 * Server-side cart utilities — Phase 6
 *
 * Validates stock, calculates pricing, and splits a cart across stores.
 * Never imported by client components — server only.
 */

import { prisma } from "@/lib/prisma";
import { calculatePrice } from "@/lib/pricing";
import { getActivePromotionsForProducts } from "@/lib/promotions";
import { roundPrice } from "@/lib/formatters";
import { CustomerType } from "@/app/generated/prisma/enums";
import type { CartItem } from "@/lib/stores/use-cart";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatedCartItem
  extends Omit<CartItem, "priceEx" | "priceInc" | "mvaRate" | "discountPct" | "discountSource" | "promotionId"> {
  priceEx: number;
  priceInc: number;
  mvaRate: number;
  discountPct: number;
  discountSource: string;
  promotionId?: string;
  lineTotalEx: number;
  lineTotalInc: number;
  /** Available stock across all stores */
  availableStock: number;
  /** true when requested qty > available stock */
  stockWarning: boolean;
  storeStock: { storeId: string; storeName: string; quantity: number }[];
}

export interface CartStoreSplit {
  storeId: string;
  storeName: string;
  items: ValidatedCartItem[];
  subtotalEx: number;
  mvaAmount: number;
  totalInc: number;
}

export interface ValidatedCart {
  items: ValidatedCartItem[];
  splits: CartStoreSplit[];
  grandTotalEx: number;
  grandMvaAmount: number;
  grandTotalInc: number;
  isMultiStore: boolean;
  hasStockWarnings: boolean;
}

interface CustomerProfile {
  customerType: CustomerType;
  defaultDiscount: { toNumber(): number } | number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Greedy store-assignment: for each item, find the store that already has
 * other items from the cart and has sufficient stock. Falls back to the
 * store with the most stock for that product.
 */
function assignStoresToItems(
  items: ValidatedCartItem[]
): ValidatedCartItem[] {
  // Map: storeId → running set of SKUs assigned to it
  const storeAssignments = new Map<string, Set<string>>();

  return items.map((item) => {
    if (item.storeStock.length === 0) return item; // no stock anywhere

    // Sort by quantity descending
    const sorted = [...item.storeStock].sort((a, b) => b.quantity - a.quantity);

    // Prefer a store that already has other cart items (reduce splits)
    const existingStore = sorted.find(
      (s) =>
        storeAssignments.has(s.storeId) &&
        s.quantity >= item.quantity
    );

    const chosenStore = existingStore ?? sorted.find((s) => s.quantity >= item.quantity) ?? sorted[0];

    const set = storeAssignments.get(chosenStore.storeId) ?? new Set();
    set.add(item.sku);
    storeAssignments.set(chosenStore.storeId, set);

    return { ...item, storeStock: item.storeStock }; // storeStock unchanged; split uses first-pass store
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Validate and price a cart against the current database state.
 *
 * @param rawItems — items from the Zustand cart store (sku + quantity)
 * @param profile  — optional logged-in customer profile for discount lookups
 */
export async function validateCart(
  rawItems: { sku: string; quantity: number }[],
  profile?: CustomerProfile
): Promise<ValidatedCart> {
  if (rawItems.length === 0) {
    return {
      items: [],
      splits: [],
      grandTotalEx: 0,
      grandMvaAmount: 0,
      grandTotalInc: 0,
      isMultiStore: false,
      hasStockWarnings: false,
    };
  }

  const skus = rawItems.map((i) => i.sku);
  const customerType = profile?.customerType ?? CustomerType.CONSUMER;

  // 1. Fetch products with stock
  const products = await prisma.product.findMany({
    where: { sku: { in: skus }, isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      mainImage: true,
      categoryId: true,
      minimumOrderQuantity: true,
      priceBase: true,
      mvaRate: true,
      stock: {
        select: {
          storeId: true,
          quantity: true,
          store: { select: { id: true, name: true } },
        },
      },
    },
  });

  const productMap = new Map(products.map((p) => [p.sku, p]));

  // 2. Fetch applicable promotions (server-side)
  const productInputs = products.map((p) => ({
    productId: p.id,
    sku: p.sku,
    categoryId: p.categoryId,
    brand: p.brand,
  }));
  const activePromotions = await getActivePromotionsForProducts(
    productInputs,
    customerType
  );

  // 3. Build validated items
  const validatedItems: ValidatedCartItem[] = [];

  for (const raw of rawItems) {
    const product = productMap.get(raw.sku);
    if (!product) continue; // product removed from catalog

    const storeStock = product.stock.map((s) => ({
      storeId: s.storeId,
      storeName: s.store.name,
      quantity: s.quantity,
    }));

    const availableStock = storeStock.reduce((sum, s) => sum + s.quantity, 0);
    const qty = Math.max(raw.quantity, product.minimumOrderQuantity);

    const priced = calculatePrice({
      priceBase: product.priceBase,
      mvaRate: product.mvaRate,
      productId: product.id,
      sku: product.sku,
      categoryId: product.categoryId,
      brand: product.brand,
      customerType,
      customerDefaultDiscount: profile?.defaultDiscount,
      activePromotions,
    });

    validatedItems.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      mainImage: product.mainImage,
      categoryId: product.categoryId,
      minimumOrderQuantity: product.minimumOrderQuantity,
      quantity: qty,
      priceEx: priced.priceEx,
      priceInc: priced.priceInc,
      mvaRate: priced.mvaRate,
      discountPct: priced.discountPct,
      discountSource: priced.discountSource,
      promotionId: priced.promotionId,
      lineTotalEx: roundPrice(priced.priceEx * qty),
      lineTotalInc: roundPrice(priced.priceInc * qty),
      availableStock,
      stockWarning: qty > availableStock,
      storeStock,
    });
  }

  // 4. Assign stores (greedy)
  const itemsWithStore = assignStoresToItems(validatedItems);

  // 5. Split by store
  // Build a map of sku → best store for this cart session
  const storeMap = new Map<string, { storeId: string; storeName: string }>();
  for (const item of itemsWithStore) {
    if (item.storeStock.length === 0) continue;
    // Pick the store with most stock, preferring already-used stores
    const existing = [...storeMap.values()];
    const preferredStoreIds = new Set(existing.map((s) => s.storeId));

    const sorted = [...item.storeStock].sort((a, b) => b.quantity - a.quantity);
    const chosen =
      sorted.find((s) => preferredStoreIds.has(s.storeId) && s.quantity >= item.quantity) ??
      sorted.find((s) => s.quantity >= item.quantity) ??
      sorted[0];

    storeMap.set(item.sku, { storeId: chosen.storeId, storeName: chosen.storeName });
  }

  // Group items by assigned store
  const splitMap = new Map<string, CartStoreSplit>();
  for (const item of itemsWithStore) {
    const assignment = storeMap.get(item.sku);
    if (!assignment) continue;

    const { storeId, storeName } = assignment;
    if (!splitMap.has(storeId)) {
      splitMap.set(storeId, {
        storeId,
        storeName,
        items: [],
        subtotalEx: 0,
        mvaAmount: 0,
        totalInc: 0,
      });
    }
    const split = splitMap.get(storeId)!;
    split.items.push(item);
    split.subtotalEx = roundPrice(split.subtotalEx + item.lineTotalEx);
    split.mvaAmount = roundPrice(split.mvaAmount + (item.lineTotalInc - item.lineTotalEx));
    split.totalInc = roundPrice(split.totalInc + item.lineTotalInc);
  }

  const splits = [...splitMap.values()];
  const grandTotalEx = roundPrice(splits.reduce((s, sp) => s + sp.subtotalEx, 0));
  const grandMvaAmount = roundPrice(splits.reduce((s, sp) => s + sp.mvaAmount, 0));
  const grandTotalInc = roundPrice(splits.reduce((s, sp) => s + sp.totalInc, 0));

  return {
    items: itemsWithStore,
    splits,
    grandTotalEx,
    grandMvaAmount,
    grandTotalInc,
    isMultiStore: splits.length > 1,
    hasStockWarnings: itemsWithStore.some((i) => i.stockWarning),
  };
}

/**
 * Get pricing for a single product SKU (used by AddToCartButton).
 * Returns null if the product is not found or inactive.
 */
export async function getSingleItemPricing(
  sku: string,
  profile?: CustomerProfile
): Promise<{
  priceEx: number;
  priceInc: number;
  mvaRate: number;
  discountPct: number;
  discountSource: string;
  promotionId?: string;
  availableStock: number;
} | null> {
  const product = await prisma.product.findUnique({
    where: { sku, isActive: true },
    select: {
      id: true,
      sku: true,
      brand: true,
      categoryId: true,
      priceBase: true,
      mvaRate: true,
      stock: { select: { quantity: true } },
    },
  });

  if (!product) return null;

  const customerType = profile?.customerType ?? CustomerType.CONSUMER;
  const activePromotions = await getActivePromotionsForProducts(
    [{ productId: product.id, sku: product.sku, categoryId: product.categoryId, brand: product.brand }],
    customerType
  );

  const priced = calculatePrice({
    priceBase: product.priceBase,
    mvaRate: product.mvaRate,
    productId: product.id,
    sku: product.sku,
    categoryId: product.categoryId,
    brand: product.brand,
    customerType,
    customerDefaultDiscount: profile?.defaultDiscount,
    activePromotions,
  });

  const availableStock = product.stock.reduce((sum, s) => sum + s.quantity, 0);

  return {
    priceEx: priced.priceEx,
    priceInc: priced.priceInc,
    mvaRate: priced.mvaRate,
    discountPct: priced.discountPct,
    discountSource: priced.discountSource,
    promotionId: priced.promotionId,
    availableStock,
  };
}
