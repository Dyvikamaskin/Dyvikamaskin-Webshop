import { describe, expect, it } from "vitest";
import { Prisma } from "@/app/generated/prisma/client";
import {
  CustomerType,
  DiscountSource,
  DiscountType,
  PromotionAudience,
  PromotionTargetType,
} from "@/app/generated/prisma/enums";
import {
  calculatePrice,
  toMoney,
  type ActivePromotion,
  type PriceInput,
} from "@/lib/pricing";

const D = Prisma.Decimal;

function input(overrides: Partial<PriceInput> = {}): PriceInput {
  return {
    priceBase: new D("1000"),
    mvaRate: new D("0.25"),
    productId: "prod-1",
    sku: "SKU-1",
    customerType: CustomerType.CONSUMER,
    ...overrides,
  };
}

describe("toMoney", () => {
  it("accepts a Prisma.Decimal", () => {
    const m = toMoney(new D("12.34"));
    expect(m.toString()).toBe("12.34");
  });

  it("accepts a decimal-formatted string", () => {
    const m = toMoney("12.34");
    expect(m.toString()).toBe("12.34");
  });

  it("throws on raw number — the bug pattern Phase 2 fixes", () => {
    expect(() => toMoney(12.34 as unknown as string)).toThrow(TypeError);
    expect(() => toMoney(0 as unknown as string)).toThrow(TypeError);
  });
});

describe("calculatePrice — MVA arithmetic", () => {
  it("applies 25 % MVA to 999.99 with bit-exact rounding", () => {
    const result = calculatePrice(
      input({ priceBase: new D("999.99"), mvaRate: new D("0.25") }),
    );
    expect(result.priceBaseEx.toString()).toBe("999.99");
    expect(result.priceEx.toString()).toBe("999.99");
    // 999.99 × 0.25 = 249.9975 → HALF_UP → 250.00
    expect(result.mvaAmount.toString()).toBe("250");
    // 999.99 + 250 = 1249.99 (sum of rounded values, no re-rounding)
    expect(result.priceInc.toString()).toBe("1249.99");
    expect(result.discountSource).toBe(DiscountSource.NONE);
  });

  it.each([
    ["0", "1000", "1000"],
    ["0.12", "1000", "1120"],
    ["0.15", "1000", "1150"],
    ["0.25", "1000", "1250"],
  ])(
    "computes priceInc for mvaRate=%s on base %s",
    (rate, base, expectedInc) => {
      const result = calculatePrice(
        input({ priceBase: new D(base), mvaRate: new D(rate) }),
      );
      expect(result.priceInc.toString()).toBe(expectedInc);
    },
  );
});

describe("calculatePrice — discount precedence (highest single discount wins)", () => {
  it("picks the higher of customer-default vs promotion when both apply", () => {
    const promo: ActivePromotion = {
      id: "p1",
      discountType: DiscountType.PERCENTAGE,
      discountValue: new D("5"),
      targetType: PromotionTargetType.PRODUCT,
      targetId: "prod-1",
      appliesToCustomerType: PromotionAudience.BOTH,
    };
    // Customer default = 10 %, promo = 5 % → customer-default wins
    const result = calculatePrice(
      input({
        customerType: CustomerType.BUSINESS,
        customerDefaultDiscount: new D("10"),
        activePromotions: [promo],
      }),
    );
    expect(result.discountPct.toString()).toBe("10");
    expect(result.discountSource).toBe(DiscountSource.CUSTOMER_DISCOUNT);
    expect(result.promotionId).toBeUndefined();
  });

  it("does not stack multiple promotions — only the highest-value promo applies", () => {
    const promos: ActivePromotion[] = [
      {
        id: "p-low",
        discountType: DiscountType.PERCENTAGE,
        discountValue: new D("5"),
        targetType: PromotionTargetType.PRODUCT,
        targetId: "prod-1",
        appliesToCustomerType: PromotionAudience.BOTH,
      },
      {
        id: "p-high",
        discountType: DiscountType.PERCENTAGE,
        discountValue: new D("20"),
        targetType: PromotionTargetType.PRODUCT,
        targetId: "prod-1",
        appliesToCustomerType: PromotionAudience.BOTH,
      },
    ];
    const result = calculatePrice(
      input({ priceBase: new D("1000"), activePromotions: promos }),
    );
    // Only the 20 % promo applies — never 5 + 20 = 25 %
    expect(result.discountPct.toString()).toBe("20");
    expect(result.discountSource).toBe(DiscountSource.PROMOTION);
    expect(result.promotionId).toBe("p-high");
    // 1000 × 0.80 = 800
    expect(result.priceEx.toString()).toBe("800");
  });

  it("promotion wins on tie with customer default", () => {
    const promo: ActivePromotion = {
      id: "p-tie",
      discountType: DiscountType.PERCENTAGE,
      discountValue: new D("10"),
      targetType: PromotionTargetType.PRODUCT,
      targetId: "prod-1",
      appliesToCustomerType: PromotionAudience.BOTH,
    };
    const result = calculatePrice(
      input({
        customerType: CustomerType.BUSINESS,
        customerDefaultDiscount: new D("10"),
        activePromotions: [promo],
      }),
    );
    expect(result.discountPct.toString()).toBe("10");
    expect(result.discountSource).toBe(DiscountSource.PROMOTION);
    expect(result.promotionId).toBe("p-tie");
  });
});

describe("calculatePrice — promotion audience matching", () => {
  it("ignores a CONSUMER-only promotion when the customer is BUSINESS", () => {
    const promo: ActivePromotion = {
      id: "p-consumer-only",
      discountType: DiscountType.PERCENTAGE,
      discountValue: new D("30"),
      targetType: PromotionTargetType.PRODUCT,
      targetId: "prod-1",
      appliesToCustomerType: PromotionAudience.CONSUMER,
    };
    const result = calculatePrice(
      input({
        customerType: CustomerType.BUSINESS,
        activePromotions: [promo],
      }),
    );
    expect(result.discountSource).toBe(DiscountSource.NONE);
    expect(result.discountPct.toString()).toBe("0");
    expect(result.priceEx.toString()).toBe("1000");
  });
});

describe("calculatePrice — FIXED_AMOUNT promotions", () => {
  it("clamps a FIXED_AMOUNT promotion that exceeds price at 100 % off", () => {
    const promo: ActivePromotion = {
      id: "p-overrun",
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: new D("5000"),
      targetType: PromotionTargetType.PRODUCT,
      targetId: "prod-1",
      appliesToCustomerType: PromotionAudience.BOTH,
    };
    const result = calculatePrice(
      input({ priceBase: new D("1000"), activePromotions: [promo] }),
    );
    // Capped at 100 % — the engine rejects negative final prices.
    expect(result.discountPct.toString()).toBe("100");
    expect(result.priceEx.toString()).toBe("0");
    expect(result.mvaAmount.toString()).toBe("0");
    expect(result.priceInc.toString()).toBe("0");
  });

  it("converts FIXED_AMOUNT to a percentage of the base ex-MVA price", () => {
    const promo: ActivePromotion = {
      id: "p-fixed",
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: new D("100"),
      targetType: PromotionTargetType.PRODUCT,
      targetId: "prod-1",
      appliesToCustomerType: PromotionAudience.BOTH,
    };
    // 100 / 1000 × 100 = 10 %
    const result = calculatePrice(
      input({ priceBase: new D("1000"), activePromotions: [promo] }),
    );
    expect(result.discountPct.toString()).toBe("10");
    expect(result.priceEx.toString()).toBe("900");
  });
});

describe("calculatePrice — unknown product safety", () => {
  it("does not apply a promotion targeted at a different product", () => {
    const promo: ActivePromotion = {
      id: "p-other",
      discountType: DiscountType.PERCENTAGE,
      discountValue: new D("30"),
      targetType: PromotionTargetType.PRODUCT,
      targetId: "OTHER-PROD",
      appliesToCustomerType: PromotionAudience.BOTH,
    };
    const result = calculatePrice(input({ activePromotions: [promo] }));
    expect(result.discountSource).toBe(DiscountSource.NONE);
    expect(result.priceEx.toString()).toBe("1000");
  });

  it("matches a CATEGORY-targeted promotion when categoryId matches", () => {
    const promo: ActivePromotion = {
      id: "p-cat",
      discountType: DiscountType.PERCENTAGE,
      discountValue: new D("15"),
      targetType: PromotionTargetType.CATEGORY,
      targetId: "cat-tools",
      appliesToCustomerType: PromotionAudience.BOTH,
    };
    const result = calculatePrice(
      input({ categoryId: "cat-tools", activePromotions: [promo] }),
    );
    expect(result.discountSource).toBe(DiscountSource.PROMOTION);
    expect(result.discountPct.toString()).toBe("15");
    expect(result.priceEx.toString()).toBe("850");
  });
});
