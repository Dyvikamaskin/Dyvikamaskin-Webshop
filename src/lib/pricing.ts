/**
 * Pricing engine — Phase 2 (Money correctness)
 *
 * Rules:
 * - consumerPrice = priceBase × (1 + mvaRate)   [inc. MVA, B2C]
 * - businessPrice = priceBase                    [ex. MVA, B2B]
 * - Highest single discount wins — no stacking.
 * - Promotion vs customer default discount: highest % wins.
 *   If equal, promotion wins (recorded for SaleItem.promotionId).
 *
 * Money discipline:
 * - Inputs accept Prisma.Decimal or string. Raw `number` throws —
 *   that is the bug pattern Phase 2 was built to fix.
 * - Internal math is Decimal end-to-end. No JS-number coercion.
 * - Per-line rounding to 2 decimals (øre) HALF_UP. Sums are NOT
 *   re-rounded after summing rounded lines.
 */
import { Prisma } from "@/app/generated/prisma/client";
import {
  DiscountSource,
  DiscountType,
  PromotionAudience,
  CustomerType,
  CustomerPriceScope,
  PromotionTargetType,
} from "@/app/generated/prisma/enums";

// ─── Money brand + constructors ───────────────────────────────────────────────

/**
 * Branded Decimal for money values. The `__money` phantom field cannot
 * be constructed from outside this module, so callers must go through
 * `toMoney()` to obtain one.
 */
export type Money = Prisma.Decimal & { readonly __money: never };

/** Acceptable input shape for any money value. */
export type MoneyInput = Prisma.Decimal | string;

const D = Prisma.Decimal;
const ZERO = new D(0) as Money;
const ONE = new D(1) as Money;
const HUNDRED = new D(100) as Money;

/**
 * Convert input to a Money value.
 * Accepts Prisma.Decimal (typical: straight from a Prisma query) or a
 * decimal-formatted string. Anything else — including raw `number` —
 * throws TypeError. This is the load-bearing guarantee that prevents
 * silent precision loss inside the pricing engine.
 */
export function toMoney(value: MoneyInput): Money {
  if (value instanceof D) return value as Money;
  if (typeof value === "string") return new D(value) as Money;
  throw new TypeError(
    `Money requires Prisma.Decimal or string, received ${typeof value}`,
  );
}

/** HALF_UP rounding to 2 decimals (øre). */
export function roundMoney(value: Money): Money {
  return value.toDecimalPlaces(2, D.ROUND_HALF_UP) as Money;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ActivePromotion {
  id: string;
  discountType: DiscountType;
  discountValue: MoneyInput;
  targetType: PromotionTargetType;
  targetId: string;
  appliesToCustomerType: PromotionAudience;
}

/**
 * One row from Profile's CustomerPriceList. Either discountPercent
 * (0-100) or fixedPrice (NOK ex-MVA per unit) is set — never both.
 * The pricing engine rejects rows that violate that invariant.
 */
export interface CustomerPriceListEntry {
  scope: CustomerPriceScope;
  scopeId?: string | null;
  discountPercent?: MoneyInput | null;
  fixedPrice?: MoneyInput | null;
}

export interface PriceInput {
  priceBase: MoneyInput;
  mvaRate: MoneyInput;
  productId: string;
  sku: string;
  categoryId?: string | null;
  brand?: string | null;
  customerType: CustomerType;
  /** Percentage as a decimal where 10 = 10 %. Defaults to 0. */
  customerDefaultDiscount?: MoneyInput;
  /** Per-customer pricing tiers (Phase 8). Empty / undefined = no
   *  tiers and the engine falls back to customerDefaultDiscount alone. */
  customerPriceList?: CustomerPriceListEntry[];
  activePromotions?: ActivePromotion[];
}

export interface PricedProduct {
  /** Base price ex. MVA (before any discount), rounded. */
  priceBaseEx: Money;
  /** Effective unit price ex. MVA (after discount), rounded. */
  priceEx: Money;
  /** Effective unit price inc. MVA (after discount). Sum of two
   *  rounded values, not re-rounded — matches the per-line rule. */
  priceInc: Money;
  /** MVA amount on the effective price, rounded. */
  mvaAmount: Money;
  /** MVA rate as a decimal, e.g. 0.25 — passed through unrounded. */
  mvaRate: Money;
  /** Discount percentage applied (0–100). */
  discountPct: Money;
  discountSource: DiscountSource;
  /** Set when discountSource === PROMOTION. */
  promotionId?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert a promotion's discountValue to an equivalent percentage of
 * the base ex-MVA price. Returns 0 when a FIXED_AMOUNT promotion
 * exceeds the base price (no negative prices). Caps at 100 %.
 */
function promotionToPct(promo: ActivePromotion, priceBaseEx: Money): Money {
  const value = toMoney(promo.discountValue);
  if (promo.discountType === DiscountType.PERCENTAGE) return value;
  if (priceBaseEx.lte(0)) return ZERO;
  const pct = value.div(priceBaseEx).mul(HUNDRED) as Money;
  return (pct.gt(HUNDRED) ? HUNDRED : pct) as Money;
}

function promotionMatchesProduct(
  promo: ActivePromotion,
  productId: string,
  sku: string,
  categoryId: string | null | undefined,
  brand: string | null | undefined,
): boolean {
  switch (promo.targetType) {
    case PromotionTargetType.PRODUCT:
      return promo.targetId === productId || promo.targetId === sku;
    case PromotionTargetType.CATEGORY:
      return categoryId != null && promo.targetId === categoryId;
    case PromotionTargetType.BRAND:
      return brand != null && promo.targetId === brand;
    default:
      return false;
  }
}

/**
 * Phase 8 — match a CustomerPriceList entry against the current
 * product context. GLOBAL always matches; PRODUCT matches on id OR sku
 * (same as promotions); CATEGORY matches categoryId; BRAND matches the
 * free-text brand string.
 */
function customerPriceMatches(
  entry: CustomerPriceListEntry,
  productId: string,
  sku: string,
  categoryId: string | null | undefined,
  brand: string | null | undefined,
): boolean {
  switch (entry.scope) {
    case CustomerPriceScope.GLOBAL:
      return true;
    case CustomerPriceScope.PRODUCT:
      return entry.scopeId === productId || entry.scopeId === sku;
    case CustomerPriceScope.CATEGORY:
      return categoryId != null && entry.scopeId === categoryId;
    case CustomerPriceScope.BRAND:
      return brand != null && entry.scopeId === brand;
    default:
      return false;
  }
}

/**
 * Phase 8 — Resolve the best CustomerPriceList outcome for this product
 * context. Returns:
 *   * fixedPrice (Money) — overrides priceBaseEx entirely; subsequent
 *     percent discounts are skipped. Only PRODUCT-scope entries with
 *     fixedPrice are honored (broader-scope fixed prices are
 *     conceptually weird; we ignore them silently).
 *   * percent (Money) — the highest discountPercent across all matching
 *     entries, or 0 if none.
 *
 * If an entry has BOTH fixedPrice and discountPercent set, we treat it
 * as malformed and skip it (admin form prevents this; double-check at
 * read time).
 */
function bestCustomerPriceListOutcome(
  entries: CustomerPriceListEntry[] | undefined,
  productId: string,
  sku: string,
  categoryId: string | null | undefined,
  brand: string | null | undefined,
): { fixedPrice?: Money; percent: Money } {
  let bestPct: Money = ZERO;
  let fixedPrice: Money | undefined;

  for (const entry of entries ?? []) {
    const fp = entry.fixedPrice != null ? toMoney(entry.fixedPrice) : null;
    const pct = entry.discountPercent != null ? toMoney(entry.discountPercent) : null;
    if (fp != null && pct != null) continue;  // malformed; skip
    if (fp == null && pct == null) continue;  // empty row; skip

    if (!customerPriceMatches(entry, productId, sku, categoryId, brand)) continue;

    if (fp != null) {
      // fixedPrice only honored at PRODUCT scope. If the customer has
      // multiple PRODUCT fixed-prices that somehow both match, the
      // lowest (best for customer) wins.
      if (entry.scope === CustomerPriceScope.PRODUCT) {
        if (!fixedPrice || fp.lt(fixedPrice)) fixedPrice = fp;
      }
      continue;
    }

    if (pct != null && pct.gt(bestPct)) bestPct = pct;
  }

  return { fixedPrice, percent: bestPct };
}

function promotionAppliesToCustomer(
  promo: ActivePromotion,
  customerType: CustomerType,
): boolean {
  return (
    promo.appliesToCustomerType === PromotionAudience.BOTH ||
    (promo.appliesToCustomerType === PromotionAudience.CONSUMER &&
      customerType === CustomerType.CONSUMER) ||
    (promo.appliesToCustomerType === PromotionAudience.BUSINESS &&
      customerType === CustomerType.BUSINESS)
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function calculatePrice(input: PriceInput): PricedProduct {
  let priceBaseEx = roundMoney(toMoney(input.priceBase));
  const mvaRate = toMoney(input.mvaRate);

  // Phase 8 — CustomerPriceList lookup. fixedPrice overrides priceBaseEx
  // entirely (and short-circuits all percentage discounts); discountPercent
  // competes with customerDefaultDiscount for the customer-tier slot.
  const tier = bestCustomerPriceListOutcome(
    input.customerPriceList,
    input.productId,
    input.sku,
    input.categoryId,
    input.brand,
  );
  let fixedPriceOverride: Money | undefined;
  if (tier.fixedPrice) {
    fixedPriceOverride = roundMoney(tier.fixedPrice);
    priceBaseEx = fixedPriceOverride;
  }

  const customerPctRaw = toMoney(input.customerDefaultDiscount ?? "0");
  let customerPct = (customerPctRaw.lt(0) ? ZERO : customerPctRaw) as Money;
  if (tier.percent.gt(customerPct)) customerPct = tier.percent;

  let bestPromoPct: Money = ZERO;
  let bestPromo: ActivePromotion | undefined;

  for (const promo of input.activePromotions ?? []) {
    if (
      !promotionMatchesProduct(
        promo,
        input.productId,
        input.sku,
        input.categoryId,
        input.brand,
      )
    )
      continue;
    if (!promotionAppliesToCustomer(promo, input.customerType)) continue;

    const pct = promotionToPct(promo, priceBaseEx);
    if (pct.gt(bestPromoPct)) {
      bestPromoPct = pct;
      bestPromo = promo;
    }
  }

  let discountPct: Money;
  let discountSource: DiscountSource;
  let promotionId: string | undefined;

  if (bestPromoPct.gt(0) && bestPromoPct.gte(customerPct)) {
    discountPct = bestPromoPct;
    discountSource = DiscountSource.PROMOTION;
    promotionId = bestPromo!.id;
  } else if (customerPct.gt(0)) {
    discountPct = customerPct;
    discountSource = DiscountSource.CUSTOMER_DISCOUNT;
  } else {
    discountPct = ZERO;
    discountSource = DiscountSource.NONE;
  }

  // Phase 8 — fixedPrice override skips percentage math entirely.
  // The customer agreed to a flat per-unit price; promotion + tier
  // percent are irrelevant against that contract.
  const factor =
    fixedPriceOverride
      ? ONE
      : ONE.minus(discountPct.div(HUNDRED)) as Money;
  if (fixedPriceOverride) {
    discountPct = ZERO;
    // Phase 8 follow-up — distinguish "fixed price contract" from a
    // percentage-based customer discount so audit/regnskap can read it
    // off cleanly.
    discountSource = DiscountSource.FIXED_PRICE;
    promotionId = undefined;
  }
  const priceEx = roundMoney(priceBaseEx.mul(factor) as Money);
  const mvaAmount = roundMoney(priceEx.mul(mvaRate) as Money);
  // priceInc is deliberately not re-rounded; it is the sum of two
  // already-rounded values, which has at most 2 decimal places.
  const priceInc = priceEx.plus(mvaAmount) as Money;

  return {
    priceBaseEx,
    priceEx,
    priceInc,
    mvaAmount,
    mvaRate,
    discountPct,
    discountSource,
    promotionId,
  };
}

/**
 * Shorthand: consumer (B2C) price — no customer-specific discount.
 * Promotions still apply if passed.
 */
export function getConsumerPrice(
  priceBase: MoneyInput,
  mvaRate: MoneyInput,
  productId: string,
  sku: string,
  options?: {
    categoryId?: string | null;
    brand?: string | null;
    activePromotions?: ActivePromotion[];
  },
): PricedProduct {
  return calculatePrice({
    priceBase,
    mvaRate,
    productId,
    sku,
    customerType: CustomerType.CONSUMER,
    ...options,
  });
}

/**
 * Shorthand: business (B2B) price with optional customer discount.
 */
export function getBusinessPrice(
  priceBase: MoneyInput,
  mvaRate: MoneyInput,
  productId: string,
  sku: string,
  options?: {
    categoryId?: string | null;
    brand?: string | null;
    customerDefaultDiscount?: MoneyInput;
    activePromotions?: ActivePromotion[];
  },
): PricedProduct {
  return calculatePrice({
    priceBase,
    mvaRate,
    productId,
    sku,
    customerType: CustomerType.BUSINESS,
    ...options,
  });
}
