"use server";

import { prisma } from "@/lib/prisma";
import { enrichProductDirectly } from "@/lib/product-enrichment";
import { runFitmentEnrichmentForProduct } from "@/lib/fitment-enrichment";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CsvProductRow {
  sku:               string;
  name:              string;
  priceBase:         number;
  brand?:            string;
  shortDescription?: string;
  partNumber?:       string;
  categorySlug?:     string;
  mvaRate?:          number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors:  string[];
}

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Creates products from a validated CSV row array.
 * Fires enrichment (product data + fitments) in background for each created product.
 * Existing SKUs are silently skipped (counted in `skipped`).
 */
export async function importProductsAction(rows: CsvProductRow[]): Promise<ImportResult> {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Pre-load category map once
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

      const categoryId = row.categorySlug
        ? (categoryBySlug.get(row.categorySlug.trim()) ?? null)
        : null;

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

  return { created, skipped, errors };
}
