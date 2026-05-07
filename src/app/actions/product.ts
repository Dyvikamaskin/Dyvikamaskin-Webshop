"use server";

import { prisma } from "@/lib/prisma";

export async function updateProductBasicAction(
  sku: string,
  data: {
    name?: string;
    shortDescription?: string;
    priceBase?: number;
    mvaRate?: number;
    isActive?: boolean;
    isDiscontinued?: boolean;
    categoryId?: string | null;
    brand?: string;
    partNumber?: string;
    minimumOrderQuantity?: number;
    leadTimeDays?: number;
    weight?: number | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.product.update({ where: { sku }, data });
    return { ok: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}
