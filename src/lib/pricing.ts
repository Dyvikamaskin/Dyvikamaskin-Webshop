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
  const priceBaseEx = roundMoney(toMoney(input.priceBase));
  const mvaRate = toMoney(input.mvaRate);

  const customerPctRaw = toMoney(input.customerDefaultDiscount ?? "0");
  const customerPct = (customerPctRaw.lt(0) ? ZERO : customerPctRaw) as Money;

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

  const factor = ONE.minus(discountPct.div(HUNDRED)) as Money;
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
