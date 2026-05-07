"use server";

import { prisma } from "@/lib/prisma";

export interface FitmentResult {
  ok: boolean;
  error?: string;
  fitment?: {
    id: string;
    productId: string;
    modelId: string;
    notes: string | null;
    model: {
      id: string;
      name: string;
      type: string;
      makeId: string;
      make: {
        id: string;
        name: string;
      };
    };
  };
}

export async function addFitmentAction(
  productId: string,
  modelId: string,
  notes?: string
): Promise<FitmentResult> {
  try {
    const fitment = await prisma.productFitment.create({
      data: {
        productId,
        modelId,
        notes: notes ?? null,
      },
      select: {
        id: true,
        productId: true,
        modelId: true,
        notes: true,
        model: {
          select: {
            id: true,
            name: true,
            type: true,
            makeId: true,
            make: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    return { ok: true, fitment };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique constraint: already exists
    if (msg.includes("23505") || msg.toLowerCase().includes("unique")) {
      return { ok: false, error: "Denne modellen er allerede lagt til for dette produktet." };
    }
    return { ok: false, error: "Kunne ikke legge til tilpasning. Prøv igjen." };
  }
}

export async function dismissFitmentProposalAction(
  productSku: string,
  modelId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.fitmentProposal.deleteMany({ where: { productSku, modelId } });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function removeFitmentAction(
  productId: string,
  modelId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.productFitment.delete({
      where: {
        productId_modelId: {
          productId,
          modelId,
        },
      },
    });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Record not found (P2025)
    if (msg.includes("P2025") || msg.toLowerCase().includes("not found")) {
      return { ok: false, error: "Tilpasningen ble ikke funnet." };
    }
    return { ok: false, error: "Kunne ikke fjerne tilpasning. Prøv igjen." };
  }
}
