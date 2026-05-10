"use server";

import { prisma } from "@/lib/prisma";
import { enrichProductDirectly } from "@/lib/product-enrichment";
import { runFitmentEnrichmentForProduct } from "@/lib/fitment-enrichment";
import { findOrCreateCategoryByPath } from "@/app/actions/category";
import {
  ProductCondition,
  ConditionRating,
  PartProvenance,
} from "@/app/generated/prisma/enums";

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku:                  string;
  name:                 string;
  priceBase:            number;
  brand?:               string;
  shortDescription?:    string;
  partNumber?:          string;
  /**
   * Pre-existing category id selected from a dropdown.
   * Mutually preferable to categoryPath when both are set, but
   * categoryPath wins if non-empty (for the auto-create flow).
   */
  categoryId?:          string;
  /**
   * Slash-separated path. New segments are auto-created via
   * findOrCreateCategoryByPath. Wins over `categoryId` when present.
   * Phase 0.6 of v4.1-implementation-plan.md.
   */
  categoryPath?:        string;
  mvaRate?:             number;
  isActive?:            boolean;
  replacesPartNumbers?: string[];
  // ── Phase 0.7 — Condition & provenance ──────────────────────────
  /** Defaults to NEW. */
  condition?:           ProductCondition;
  /** Required when condition === USED. */
  conditionRating?:     ConditionRating | null;
  /** Free-text notes; usually only used when condition === USED. */
  conditionNotes?:      string;
  /** Defaults to AFTERMARKET on manual creation. */
  provenance?:          PartProvenance;
}

export interface CreateProductResult {
  ok: boolean;
  sku?: string;
  error?: string;
  /**
   * Names of category segments newly created during this call (in
   * root-to-leaf order). Empty when `categoryPath` was not used or all
   * segments already existed. Lets the caller surface a "we created
   * X" hint to the admin.
   */
  createdCategories?: string[];
}

export async function createProductAction(
  data: CreateProductInput
): Promise<CreateProductResult> {
  if (!data.sku?.trim())  return { ok: false, error: "SKU er påkrevd." };
  if (!data.name?.trim()) return { ok: false, error: "Navn er påkrevd." };
  if (!data.priceBase || isNaN(Number(data.priceBase))) {
    return { ok: false, error: "Ugyldig pris." };
  }

  // Cross-field: USED requires a rating. Notes alone do not satisfy.
  const condition = data.condition ?? ProductCondition.NEW;
  if (condition === ProductCondition.USED && !data.conditionRating) {
    return {
      ok: false,
      error: "Tilstandsgrad er påkrevd når tilstand er Brukt.",
    };
  }

  try {
    const existing = await prisma.product.findUnique({ where: { sku: data.sku.trim() } });
    if (existing) return { ok: false, error: `SKU "${data.sku}" er allerede i bruk.` };

    const replacesPartNumbers = data.replacesPartNumbers
      ? [...new Set(data.replacesPartNumbers.map((p) => p.trim()).filter(Boolean))]
      : [];

    // Resolve category. categoryPath wins over categoryId when present.
    let categoryId: string | null = data.categoryId?.trim() || null;
    let createdCategories: string[] = [];

    const path = data.categoryPath?.trim();
    if (path) {
      try {
        const resolution = await findOrCreateCategoryByPath(path);
        categoryId = resolution.leafId;
        createdCategories = resolution.created;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ugyldig kategoristi";
        return { ok: false, error: message };
      }
    }

    await prisma.product.create({
      data: {
        sku:                  data.sku.trim(),
        name:                 data.name.trim(),
        priceBase:            Number(data.priceBase),
        brand:                data.brand?.trim()            || null,
        shortDescription:     data.shortDescription?.trim() || null,
        partNumber:           data.partNumber?.trim()       || null,
        categoryId,
        mvaRate:              data.mvaRate                  ?? 0.25,
        isActive:             data.isActive                 ?? true,
        replacesPartNumbers,
        condition,
        conditionRating: condition === ProductCondition.USED
          ? data.conditionRating ?? null
          : null,
        conditionNotes: data.conditionNotes?.trim() || null,
        provenance: data.provenance ?? PartProvenance.AFTERMARKET,
      },
    });

    // Fire enrichment in the background — do not await
    void Promise.allSettled([
      enrichProductDirectly(data.sku.trim()),
      runFitmentEnrichmentForProduct(data.sku.trim()),
    ]);

    return {
      ok: true,
      sku: data.sku.trim(),
      createdCategories: createdCategories.length > 0 ? createdCategories : undefined,
    };
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
