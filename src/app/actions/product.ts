"use server";

import { prisma } from "@/lib/prisma";
import { enrichProductDirectly } from "@/lib/product-enrichment";
import { runFitmentEnrichmentForProduct } from "@/lib/fitment-enrichment";

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku:               string;
  name:              string;
  priceBase:         number;
  brand?:            string;
  shortDescription?: string;
  partNumber?:       string;
  categoryId?:       string;
  mvaRate?:          number;
  isActive?:         boolean;
}

export async function createProductAction(
  data: CreateProductInput
): Promise<{ ok: boolean; sku?: string; error?: string }> {
  if (!data.sku?.trim())  return { ok: false, error: "SKU er påkrevd." };
  if (!data.name?.trim()) return { ok: false, error: "Navn er påkrevd." };
  if (!data.priceBase || isNaN(Number(data.priceBase))) {
    return { ok: false, error: "Ugyldig pris." };
  }

  try {
    const existing = await prisma.product.findUnique({ where: { sku: data.sku.trim() } });
    if (existing) return { ok: false, error: `SKU "${data.sku}" er allerede i bruk.` };

    await prisma.product.create({
      data: {
        sku:              data.sku.trim(),
        name:             data.name.trim(),
        priceBase:        Number(data.priceBase),
        brand:            data.brand?.trim()            || null,
        shortDescription: data.shortDescription?.trim() || null,
        partNumber:       data.partNumber?.trim()       || null,
        categoryId:       data.categoryId               || null,
        mvaRate:          data.mvaRate                  ?? 0.25,
        isActive:         data.isActive                 ?? true,
      },
    });

    // Fire enrichment in the background — do not await
    void Promise.allSettled([
      enrichProductDirectly(data.sku.trim()),
      runFitmentEnrichmentForProduct(data.sku.trim()),
    ]);

    return { ok: true, sku: data.sku.trim() };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}

// ─── Replaces part numbers ────────────────────────────────────────────────────

/**
 * Overwrites the replacesPartNumbers array for a product.
 * Deduplicates and trims values before saving.
 */
export async function updateReplacesPartNumbersAction(
  sku: string,
  partNumbers: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleaned = [...new Set(partNumbers.map((p) => p.trim()).filter(Boolean))];
    await prisma.product.update({
      where: { sku },
      data:  { replacesPartNumbers: cleaned },
    });
    return { ok: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

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
