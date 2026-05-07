/**
 * Pricing engine — Phase 5
 *
 * Rules:
 * - consumerPrice = priceBase × (1 + mvaRate)   [inc. MVA, B2C]
 * - businessPrice = priceBase                    [ex. MVA, B2B]
 * - Highest single discount wins — no stacking.
 * - Promotion vs customer default discount: highest % wins.
 *   If equal, promotion wins (recorded for SaleItem.promotionId).
 */

import {
  DiscountSource,
  DiscountType,
  PromotionAudience,
  CustomerType,
  PromotionTargetType,
} from "@/app/generated/prisma/enums";
import { roundPrice } from "@/lib/formatters";

// ─── Shared numeric helper ────────────────────────────────────────────────────

type Numeric = number | { toNumber(): number };

function n(v: Numeric): number {
  return typeof v === "number" ? v : v.toNumber();
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ActivePromotion {
  id: string;
  discountType: DiscountType;
  discountValue: Numeric;
  targetType: PromotionTargetType;
  targetId: string;
  appliesToCustomerType: PromotionAudience;
}

export interface PriceInput {
  priceBase: Numeric;
  mvaRate: Numeric;
  productId: string;
  sku: string;
  categoryId?: string | null;
  brand?: string | null;
  customerType: CustomerType;
  /** Percentage, e.g. 10 = 10 % off. Defaults to 0. */
  customerDefaultDiscount?: Numeric;
  activePromotions?: ActivePromotion[];
}

export interface PricedProduct {
  /** Base price ex. MVA (before any discount) */
  priceBaseEx: number;
  /** Effective unit price ex. MVA (after discount) */
  priceEx: number;
  /** Effective unit price inc. MVA (after discount) */
  priceInc: number;
  /** MVA amount on the effective price */
  mvaAmount: number;
  /** MVA rate as a decimal, e.g. 0.25 */
  mvaRate: number;
  /** Discount percentage applied (0–100) */
  discountPct: number;
  discountSource: DiscountSource;
  /** Set when discountSource === PROMOTION */
  promotionId?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert promotion discountValue to an equivalent percentage of the
 * base ex-MVA price. Returns 0 when a FIXED_AMOUNT promotion exceeds
 * the base price (no negative prices).
 */
function promotionToPct(promo: ActivePromotion, priceBaseEx: number): number {
  const val = n(promo.discountValue);
  if (promo.discountType === DiscountType.PERCENTAGE) return val;
  // FIXED_AMOUNT — express as percentage
  if (priceBaseEx <= 0) return 0;
  return Math.min(100, roundPrice((val / priceBaseEx) * 100));
}

function promotionMatchesProduct(
  promo: ActivePromotion,
  productId: string,
  sku: string,
  categoryId: string | null | undefined,
  brand: string | null | undefined
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
  customerType: CustomerType
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

/**
 * Calculate the effective price for a product given the customer context.
 *
 * Highest single discount wins — no stacking.
 * If promotion discount >= customer discount, promotion wins.
 * If no discount applies, source is NONE.
 */
export function calculatePrice(input: PriceInput): PricedProduct {
  const priceBaseEx = roundPrice(n(input.priceBase));
  const mvaRate = n(input.mvaRate);

  // 1. Customer default discount (percentage, e.g. 10 = 10 %)
  const customerPct = Math.max(0, n(input.customerDefaultDiscount ?? 0));

  // 2. Best matching promotion
  let bestPromoPct = 0;
  let bestPromo: ActivePromotion | undefined;

  for (const promo of input.activePromotions ?? []) {
    if (
      !promotionMatchesProduct(
        promo,
        input.productId,
        input.sku,
        input.categoryId,
        input.brand
      )
    )
      continue;
    if (!promotionAppliesToCustomer(promo, input.customerType)) continue;

    const pct = promotionToPct(promo, priceBaseEx);
    if (pct > bestPromoPct) {
      bestPromoPct = pct;
      bestPromo = promo;
    }
  }

  // 3. Highest wins
  let discountPct: number;
  let discountSource: DiscountSource;
  let promotionId: string | undefined;

  if (bestPromoPct > 0 && bestPromoPct >= customerPct) {
    discountPct = bestPromoPct;
    discountSource = DiscountSource.PROMOTION;
    promotionId = bestPromo!.id;
  } else if (customerPct > 0) {
    discountPct = customerPct;
    discountSource = DiscountSource.CUSTOMER_DISCOUNT;
  } else {
    discountPct = 0;
    discountSource = DiscountSource.NONE;
  }

  // 4. Apply
  const priceEx = roundPrice(priceBaseEx * (1 - discountPct / 100));
  const mvaAmount = roundPrice(priceEx * mvaRate);
  const priceInc = roundPrice(priceEx + mvaAmount);

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
  priceBase: Numeric,
  mvaRate: Numeric,
  productId: string,
  sku: string,
  options?: {
    categoryId?: string | null;
    brand?: string | null;
    activePromotions?: ActivePromotion[];
  }
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
  priceBase: Numeric,
  mvaRate: Numeric,
  productId: string,
  sku: string,
  options?: {
    categoryId?: string | null;
    brand?: string | null;
    customerDefaultDiscount?: Numeric;
    activePromotions?: ActivePromotion[];
  }
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
