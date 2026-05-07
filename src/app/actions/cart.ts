"use server";

import { getSingleItemPricing, validateCart } from "@/lib/cart";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerType } from "@/app/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemPricingResult {
  priceEx: number;
  priceInc: number;
  mvaRate: number;
  discountPct: number;
  discountSource: string;
  promotionId?: string;
  availableStock: number;
}

type CustomerProfile = { customerType: CustomerType; defaultDiscount: number };

// ─── Shared helper ────────────────────────────────────────────────────────────

/**
 * If there is a signed-in user, return their pricing profile.
 * For anonymous visitors, returns undefined → standard (no discount) pricing.
 */
async function resolveCustomerProfile(): Promise<CustomerProfile | undefined> {
  const user = await getAuthUser();
  if (!user) return undefined;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { customerType: true, defaultDiscount: true },
  });

  if (!profile) return undefined;

  return {
    customerType: profile.customerType as CustomerType,
    defaultDiscount: profile.defaultDiscount.toNumber(),
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Called by AddToCartButton to get fresh server-side pricing before
 * adding an item to the client-side Zustand cart.
 */
export async function getItemPricingAction(
  sku: string
): Promise<{ ok: true; data: ItemPricingResult } | { ok: false; error: string }> {
  try {
    const profile = await resolveCustomerProfile();
    const result = await getSingleItemPricing(sku, profile);

    if (!result) {
      return { ok: false, error: "Produktet ble ikke funnet." };
    }

    if (result.availableStock === 0) {
      return { ok: false, error: "Produktet er ikke på lager." };
    }

    return { ok: true, data: result };
  } catch (error) {
    console.error("[getItemPricingAction]", error);
    return { ok: false, error: "Det oppstod en feil. Prøv igjen." };
  }
}

/**
 * Called when the cart page mounts — re-validates all items against
 * current stock and pricing.
 */
export async function validateCartAction(
  items: { sku: string; quantity: number }[]
) {
  try {
    const profile = await resolveCustomerProfile();
    return await validateCart(items, profile);
  } catch (error) {
    console.error("[validateCartAction]", error);
    throw new Error("Handlekurven kunne ikke valideres. Prøv igjen.");
  }
}
