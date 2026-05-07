/**
 * Active-promotion queries — Phase 6
 *
 * Only server-side. All results feed into calculatePrice() in pricing.ts.
 */

import { prisma } from "@/lib/prisma";
import type { ActivePromotion } from "@/lib/pricing";
import {
  PromotionAudience,
  CustomerType,
} from "@/app/generated/prisma/enums";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Return all promotions that are currently active.
 * Optionally filter to only those applicable to a given customer type.
 */
export async function getActivePromotions(
  customerType?: CustomerType
): Promise<ActivePromotion[]> {
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    isActive: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
  };

  if (customerType) {
    where.appliesToCustomerType = {
      in:
        customerType === CustomerType.CONSUMER
          ? [PromotionAudience.CONSUMER, PromotionAudience.BOTH]
          : [PromotionAudience.BUSINESS, PromotionAudience.BOTH],
    };
  }

  const rows = await prisma.promotion.findMany({
    where,
    select: {
      id: true,
      discountType: true,
      discountValue: true,
      targetType: true,
      targetId: true,
      appliesToCustomerType: true,
    },
  });

  return rows as ActivePromotion[];
}

/**
 * Return active promotions that could match any of the given products.
 * Pre-filters to reduce noise when pricing a batch of items.
 */
export async function getActivePromotionsForProducts(
  products: {
    productId: string;
    sku: string;
    categoryId?: string | null;
    brand?: string | null;
  }[],
  customerType?: CustomerType
): Promise<ActivePromotion[]> {
  const promotions = await getActivePromotions(customerType);

  // Pre-filter to promotions that could possibly match one of the products
  const productIds = new Set(products.map((p) => p.productId));
  const skus = new Set(products.map((p) => p.sku));
  const categoryIds = new Set(
    products.map((p) => p.categoryId).filter(Boolean) as string[]
  );
  const brands = new Set(
    products.map((p) => p.brand).filter(Boolean) as string[]
  );

  return promotions.filter((promo) => {
    switch (promo.targetType) {
      case "PRODUCT":
        return productIds.has(promo.targetId) || skus.has(promo.targetId);
      case "CATEGORY":
        return categoryIds.has(promo.targetId);
      case "BRAND":
        return brands.has(promo.targetId);
      default:
        return false;
    }
  });
}
