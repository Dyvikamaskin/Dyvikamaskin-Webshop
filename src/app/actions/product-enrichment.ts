"use server";

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The Product fields that enrichment can propose values for. */
export type EnrichableField = "name" | "brand" | "shortDescription" | "mainImage";

// ─── Accept one field ─────────────────────────────────────────────────────────

/**
 * Copies one enrichment suggestion onto the live Product record.
 * After accepting, nulls out that field on the proposal.
 * If all four fields are now null, the proposal record is deleted automatically.
 */
export async function acceptEnrichmentFieldAction(
  sku: string,
  field: EnrichableField,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Apply to product
    await prisma.product.update({ where: { sku }, data: { [field]: value } });

    // Null out accepted field on the proposal
    const fieldMap: Record<EnrichableField, string> = {
      name:             "suggestedName",
      brand:            "suggestedBrand",
      shortDescription: "suggestedDesc",
      mainImage:        "suggestedImage",
    };

    const updated = await prisma.productEnrichmentProposal.update({
      where:  { productSku: sku },
      data:   { [fieldMap[field]]: null },
      select: {
        suggestedName:  true,
        suggestedBrand: true,
        suggestedDesc:  true,
        suggestedImage: true,
      },
    });

    // Auto-delete if no suggestions remain
    const allGone =
      !updated.suggestedName &&
      !updated.suggestedBrand &&
      !updated.suggestedDesc  &&
      !updated.suggestedImage;

    if (allGone) {
      await prisma.productEnrichmentProposal.delete({ where: { productSku: sku } });
    }

    return { ok: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}

// ─── Dismiss all ──────────────────────────────────────────────────────────────

/**
 * Discards the entire enrichment proposal for a product without applying anything.
 */
export async function dismissEnrichmentProposalAction(
  sku: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.productEnrichmentProposal.deleteMany({ where: { productSku: sku } });
    return { ok: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Ukjent feil";
    return { ok: false, error };
  }
}
