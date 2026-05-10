"use server";

import { prisma } from "@/lib/prisma";
import { enrichProductDirectly } from "@/lib/product-enrichment";
import { runFitmentEnrichmentForProduct } from "@/lib/fitment-enrichment";
import { findOrCreateCategoryByPath } from "@/app/actions/category";
import { revalidatePath } from "next/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CsvProductRow {
  sku:               string;
  name:              string;
  priceBase:         number;
  brand?:            string;
  shortDescription?: string;
  partNumber?:       string;
  /**
   * Slash-separated category path. New segments auto-create.
   * Phase 0.6 — replaces the v3-era `categorySlug` column.
   */
  categoryPath?:     string;
  /**
   * Legacy column from the v3 import format. Looks up an existing
   * category by exact slug; on miss the row falls back to no category
   * (with a warning recorded in the import summary). Kept for
   * backwards compat; new imports should use `categoryPath`.
   */
  categorySlug?:     string;
  mvaRate?:          number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors:  string[];
  /**
   * Names of category segments newly created during this import (root
   * to leaf, deduplicated). Lets the import-summary UI surface the
   * taxonomy expansion explicitly so admins notice typos instead of
   * accumulating stray categories.
   */
  newCategories: string[];
}

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Create products from a validated CSV row array.
 * Fires enrichment (product data + fitments) in background per created
 * product. Existing SKUs are silently skipped (counted in `skipped`).
 *
 * Category resolution rules:
 *   1. `categoryPath` if non-empty: resolved by findOrCreateCategoryByPath,
 *      auto-creating any missing segment.
 *   2. `categorySlug` if non-empty (legacy): looked up by exact slug; on
 *      miss the product imports without a category and a warning is
 *      added to errors[].
 *   3. Neither: product imports without a category.
 */
export async function importProductsAction(
  rows: CsvProductRow[]
): Promise<ImportResult> {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const newCategorySet = new Set<string>();

  // Pre-load category-by-slug map for the legacy categorySlug path.
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  for (const row of rows) {
    try {
      const sku = row.sku?.trim();
      if (!sku) {
        errors.push(`Rad uten SKU — hoppet over`);
        skipped++;
        continue;
      }
      if (!row.name?.trim()) {
        errors.push(`${sku}: mangler navn`);
        skipped++;
        continue;
      }
      const price = Number(row.priceBase);
      if (!row.priceBase || isNaN(price)) {
        errors.push(`${sku}: ugyldig pris "${row.priceBase}"`);
        skipped++;
        continue;
      }

      // Skip duplicates
      const existing = await prisma.product.findUnique({ where: { sku } });
      if (existing) {
        skipped++;
        continue;
      }

      // Resolve category: categoryPath (new) wins over categorySlug (legacy).
      let categoryId: string | null = null;

      const path = row.categoryPath?.trim();
      const legacySlug = row.categorySlug?.trim();

      if (path) {
        try {
          const resolution = await findOrCreateCategoryByPath(path);
          categoryId = resolution.leafId;
          for (const segment of resolution.created) newCategorySet.add(segment);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Ugyldig kategoristi";
          errors.push(`${sku}: ${msg}`);
          skipped++;
          continue;
        }
      } else if (legacySlug) {
        const id = categoryBySlug.get(legacySlug);
        if (id) {
          categoryId = id;
        } else {
          errors.push(`${sku}: ukjent categorySlug "${legacySlug}" — importert uten kategori`);
        }
      }

      await prisma.product.create({
        data: {
          sku,
          name:             row.name.trim(),
          priceBase:        price,
          brand:            row.brand?.trim()            || null,
          shortDescription: row.shortDescription?.trim() || null,
          partNumber:       row.partNumber?.trim()       || null,
          categoryId,
          mvaRate:          row.mvaRate != null ? Number(row.mvaRate) : 0.25,
          isActive:         true,
        },
      });
      created++;

      // Fire enrichment per product — don't await, let the loop continue
      void Promise.allSettled([
        enrichProductDirectly(sku),
        runFitmentEnrichmentForProduct(sku),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ukjent feil";
      errors.push(`${row.sku ?? "?"}: ${msg}`);
      skipped++;
    }
  }

  if (created > 0 || newCategorySet.size > 0) {
    revalidatePath("/admin/produkter");
    revalidatePath("/admin/kategorier");
    revalidatePath("/", "layout");
  }

  return {
    created,
    skipped,
    errors,
    newCategories: [...newCategorySet],
  };
}
