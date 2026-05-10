/**
 * Server-side cart utilities — Phase 2 (Money correctness).
 *
 * Validates stock, calculates pricing, and splits a cart across stores.
 * Never imported by client components — server only.
 *
 * Money discipline: all internal arithmetic uses Prisma.Decimal. Public
 * types (ValidatedCart, ValidatedCartItem, CartStoreSplit, the return
 * shape of getSingleItemPricing) carry money as strings — that is what
 * crosses the server-action wire and what the Zustand cart store
 * persists. Callers parse to Decimal again at the next math boundary.
 */
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePrice, type Money } from "@/lib/pricing";
import { getActivePromotionsForProducts } from "@/lib/promotions";
import { CustomerType } from "@/app/generated/prisma/enums";
import type { CartItem } from "@/lib/stores/use-cart";

const D = Prisma.Decimal;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatedCartItem
  extends Omit<
    CartItem,
    | "priceEx"
    | "priceInc"
    | "mvaRate"
    | "discountPct"
    | "discountSource"
    | "promotionId"
  > {
  priceEx: string;
  priceInc: string;
  mvaRate: string;
  discountPct: string;
  discountSource: string;
  promotionId?: string;
  lineTotalEx: string;
  lineTotalInc: string;
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
  subtotalEx: string;
  mvaAmount: string;
  totalInc: string;
}

export interface ValidatedCart {
  items: ValidatedCartItem[];
  splits: CartStoreSplit[];
  grandTotalEx: string;
  grandMvaAmount: string;
  grandTotalInc: string;
  isMultiStore: boolean;
  hasStockWarnings: boolean;
}

interface CustomerProfile {
  /** Profile.id — required for Phase 8 CustomerPriceList lookup.
   *  Optional for back-compat; when null the engine skips tier lookups. */
  customerId?: string;
  customerType: CustomerType;
  defaultDiscount: Prisma.Decimal | string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Greedy store-assignment: for each item, find the store that already has
 * other items from the cart and has sufficient stock. Falls back to the
 * store with the most stock for that product.
 */
function assignStoresToItems(
  items: ValidatedCartItem[],
): ValidatedCartItem[] {
  const storeAssignments = new Map<string, Set<string>>();

  return items.map((item) => {
    if (item.storeStock.length === 0) return item;

    const sorted = [...item.storeStock].sort((a, b) => b.quantity - a.quantity);

    const existingStore = sorted.find(
      (s) => storeAssignments.has(s.storeId) && s.quantity >= item.quantity,
    );
    const chosenStore =
      existingStore ?? sorted.find((s) => s.quantity >= item.quantity) ?? sorted[0];

    const set = storeAssignments.get(chosenStore.storeId) ?? new Set();
    set.add(item.sku);
    storeAssignments.set(chosenStore.storeId, set);

    return { ...item, storeStock: item.storeStock };
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
  profile?: CustomerProfile,
): Promise<ValidatedCart> {
  if (rawItems.length === 0) {
    return {
      items: [],
      splits: [],
      grandTotalEx: "0",
      grandMvaAmount: "0",
      grandTotalInc: "0",
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
    customerType,
  );

  // 2b. Phase 8 — load this customer's pricing tier rules.
  // Empty array for anon shoppers (no profile).
  const customerPriceList = profile?.customerId
    ? await prisma.customerPriceList.findMany({
        where: { profileId: profile.customerId },
        select: {
          scope: true,
          scopeId: true,
          discountPercent: true,
          fixedPrice: true,
        },
      })
    : [];

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
      customerPriceList,
      activePromotions,
    });

    // Line totals: per-line × integer qty is exact, no rounding.
    const lineTotalEx = priced.priceEx.mul(qty) as Money;
    const lineTotalInc = priced.priceInc.mul(qty) as Money;

    validatedItems.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      mainImage: product.mainImage,
      categoryId: product.categoryId,
      minimumOrderQuantity: product.minimumOrderQuantity,
      quantity: qty,
      priceEx: priced.priceEx.toString(),
      priceInc: priced.priceInc.toString(),
      mvaRate: priced.mvaRate.toString(),
      discountPct: priced.discountPct.toString(),
      discountSource: priced.discountSource,
      promotionId: priced.promotionId,
      lineTotalEx: lineTotalEx.toString(),
      lineTotalInc: lineTotalInc.toString(),
      availableStock,
      stockWarning: qty > availableStock,
      storeStock,
    });
  }

  // 4. Assign stores (greedy)
  const itemsWithStore = assignStoresToItems(validatedItems);

  // 5. Split by store
  const storeMap = new Map<string, { storeId: string; storeName: string }>();
  for (const item of itemsWithStore) {
    if (item.storeStock.length === 0) continue;
    const existing = [...storeMap.values()];
    const preferredStoreIds = new Set(existing.map((s) => s.storeId));

    const sorted = [...item.storeStock].sort((a, b) => b.quantity - a.quantity);
    const chosen =
      sorted.find(
        (s) => preferredStoreIds.has(s.storeId) && s.quantity >= item.quantity,
      ) ??
      sorted.find((s) => s.quantity >= item.quantity) ??
      sorted[0];

    storeMap.set(item.sku, { storeId: chosen.storeId, storeName: chosen.storeName });
  }

  // 6. Group items by assigned store, summing in Decimal.
  interface SplitAccumulator {
    storeId: string;
    storeName: string;
    items: ValidatedCartItem[];
    subtotalEx: Prisma.Decimal;
    mvaAmount: Prisma.Decimal;
    totalInc: Prisma.Decimal;
  }
  const splitMap = new Map<string, SplitAccumulator>();
  for (const item of itemsWithStore) {
    const assignment = storeMap.get(item.sku);
    if (!assignment) continue;

    const { storeId, storeName } = assignment;
    if (!splitMap.has(storeId)) {
      splitMap.set(storeId, {
        storeId,
        storeName,
        items: [],
        subtotalEx: new D(0),
        mvaAmount: new D(0),
        totalInc: new D(0),
      });
    }
    const split = splitMap.get(storeId)!;
    split.items.push(item);

    const lineEx = new D(item.lineTotalEx);
    const lineInc = new D(item.lineTotalInc);
    split.subtotalEx = split.subtotalEx.plus(lineEx);
    split.mvaAmount = split.mvaAmount.plus(lineInc.minus(lineEx));
    split.totalInc = split.totalInc.plus(lineInc);
  }

  const splits: CartStoreSplit[] = [...splitMap.values()].map((acc) => ({
    storeId: acc.storeId,
    storeName: acc.storeName,
    items: acc.items,
    subtotalEx: acc.subtotalEx.toString(),
    mvaAmount: acc.mvaAmount.toString(),
    totalInc: acc.totalInc.toString(),
  }));

  const grandTotalEx = splits
    .reduce((s, sp) => s.plus(sp.subtotalEx), new D(0))
    .toString();
  const grandMvaAmount = splits
    .reduce((s, sp) => s.plus(sp.mvaAmount), new D(0))
    .toString();
  const grandTotalInc = splits
    .reduce((s, sp) => s.plus(sp.totalInc), new D(0))
    .toString();

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
  profile?: CustomerProfile,
): Promise<{
  priceEx: string;
  priceInc: string;
  mvaRate: string;
  discountPct: string;
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
    [
      {
        productId: product.id,
        sku: product.sku,
        categoryId: product.categoryId,
        brand: product.brand,
      },
    ],
    customerType,
  );

  // Phase 8 — per-customer pricing tier rules
  const customerPriceList = profile?.customerId
    ? await prisma.customerPriceList.findMany({
        where: { profileId: profile.customerId },
        select: {
          scope: true,
          scopeId: true,
          discountPercent: true,
          fixedPrice: true,
        },
      })
    : [];

  const priced = calculatePrice({
    priceBase: product.priceBase,
    mvaRate: product.mvaRate,
    productId: product.id,
    sku: product.sku,
    categoryId: product.categoryId,
    brand: product.brand,
    customerType,
    customerDefaultDiscount: profile?.defaultDiscount,
    customerPriceList,
    activePromotions,
  });

  const availableStock = product.stock.reduce((sum, s) => sum + s.quantity, 0);

  return {
    priceEx: priced.priceEx.toString(),
    priceInc: priced.priceInc.toString(),
    mvaRate: priced.mvaRate.toString(),
    discountPct: priced.discountPct.toString(),
    discountSource: priced.discountSource,
    promotionId: priced.promotionId,
    availableStock,
  };
}
