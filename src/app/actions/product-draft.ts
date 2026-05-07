"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { runEnrichmentPipeline } from "@/lib/product-enrichment";
import {
  UserRole,
  ProductDraftStatus,
  ProductRequestStatus,
} from "@/app/generated/prisma/enums";

export type DraftResult =
  | { ok: true;  id?: string }
  | { ok: false; error: string };

// ─── Submit a product request (customer or staff scanned unknown code) ────────

export async function submitProductRequestAction(
  scannedCode: string,
  email: string | null,
  notes: string | null
): Promise<DraftResult> {
  if (!scannedCode.trim()) return { ok: false, error: "Ugyldig kode." };

  // Create the request — may or may not have a logged-in user
  let profileId: string | null = null;
  try {
    const staff = await requireRole(UserRole.FULFILLMENT_STAFF);
    profileId   = staff.id;
  } catch { /* anonymous / customer — fine */ }

  const request = await prisma.productRequest.create({
    data: {
      scannedCode: scannedCode.trim(),
      requestedById: profileId,
      email:         email?.trim() || null,
      notes:         notes?.trim() || null,
      status:        ProductRequestStatus.PENDING,
    },
  });

  // Fire enrichment in the background (no await — don't block the response)
  void triggerEnrichmentForRequest(request.id, scannedCode.trim());

  revalidatePath("/admin/produktforslag");
  return { ok: true, id: request.id };
}

// Internal: run enrichment and link draft to request
async function triggerEnrichmentForRequest(requestId: string, code: string) {
  try {
    // Check if a draft already exists for this code
    let draft = await prisma.productDraft.findFirst({
      where: { scannedCode: code, status: ProductDraftStatus.PENDING },
    });

    if (!draft) {
      const result = await runEnrichmentPipeline(code);
      draft = await prisma.productDraft.findUnique({ where: { id: result.draftId } });
    }

    if (draft) {
      await prisma.productRequest.update({
        where: { id: requestId },
        data: {
          draftId: draft.id,
          status:  ProductRequestStatus.IN_ENRICHMENT,
        },
      });
    }
  } catch (err) {
    console.error("[enrichment] failed for request", requestId, err);
  }
}

// ─── Admin: approve draft → create live product ───────────────────────────────

export async function approveDraftAction(
  draftId: string,
  data: {
    sku:             string;
    name:            string;
    brand:           string | null;
    shortDescription: string | null;
    priceBase:       number;
    categoryId:      string | null;
  }
): Promise<DraftResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const draft = await prisma.productDraft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: false, error: "Utkast ikke funnet." };
  if (draft.status !== ProductDraftStatus.PENDING) {
    return { ok: false, error: "Utkastet er allerede behandlet." };
  }

  // Check SKU uniqueness
  const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
  if (existing) return { ok: false, error: `SKU «${data.sku}» er allerede i bruk.` };

  const product = await prisma.product.create({
    data: {
      sku:              data.sku,
      name:             data.name,
      brand:            data.brand,
      shortDescription: data.shortDescription,
      priceBase:        data.priceBase,
      categoryId:       data.categoryId,
      mainImage:        draft.suggestedImage,
      barcodes:         [draft.scannedCode],
      isActive:         true,
    },
  });

  await prisma.productDraft.update({
    where: { id: draftId },
    data: {
      status:       ProductDraftStatus.APPROVED,
      reviewedById: admin.id,
      reviewedAt:   new Date(),
    },
  });

  // Mark all linked requests as ADDED
  await prisma.productRequest.updateMany({
    where: { draftId },
    data:  { status: ProductRequestStatus.ADDED },
  });

  await logAudit(admin.id, "PRODUCT_DRAFT_APPROVED", "ProductDraft", draftId, null, {
    productId: product.id,
    sku:       data.sku,
  });

  revalidatePath("/admin/produktforslag");
  revalidatePath("/admin/produktforslag/" + draftId);
  return { ok: true, id: product.id };
}

// ─── Admin: reject draft ──────────────────────────────────────────────────────

export async function rejectDraftAction(
  draftId: string,
  notes: string
): Promise<DraftResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const draft = await prisma.productDraft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: false, error: "Utkast ikke funnet." };

  await prisma.productDraft.update({
    where: { id: draftId },
    data: {
      status:       ProductDraftStatus.REJECTED,
      notes:        notes.trim() || null,
      reviewedById: admin.id,
      reviewedAt:   new Date(),
    },
  });

  await prisma.productRequest.updateMany({
    where: { draftId },
    data:  { status: ProductRequestStatus.REJECTED },
  });

  await logAudit(admin.id, "PRODUCT_DRAFT_REJECTED", "ProductDraft", draftId, null, { notes });

  revalidatePath("/admin/produktforslag");
  revalidatePath("/admin/produktforslag/" + draftId);
  return { ok: true };
}

// ─── Void form-action wrappers ────────────────────────────────────────────────

export async function rejectDraftFormAction(
  draftId: string,
  formData: FormData
): Promise<void> {
  const notes = String(formData.get("notes") ?? "");
  await rejectDraftAction(draftId, notes);
}
