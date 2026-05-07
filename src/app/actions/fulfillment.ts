"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { UserRole, FulfillmentStatus } from "@/app/generated/prisma/enums";

export type FulfillmentResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

// ─── Bulk status update ───────────────────────────────────────────────────────

/**
 * Set fulfillment status on multiple orders at once.
 * Used by the batch dispatch page to advance a whole batch slot.
 */
export async function setBatchFulfillmentStatusAction(
  saleIds: string[],
  status: FulfillmentStatus
): Promise<FulfillmentResult> {
  const staff = await requireRole(UserRole.FULFILLMENT_STAFF);

  if (!saleIds.length) return { ok: false, error: "Ingen ordrer valgt." };

  const result = await prisma.sale.updateMany({
    where: { id: { in: saleIds } },
    data:  { fulfillmentStatus: status },
  });

  await logAudit(staff.id, "BATCH_FULFILLMENT_UPDATED", "Sale", saleIds[0], null, {
    saleIds,
    status,
    count: result.count,
  });

  revalidatePath("/admin/batch");
  revalidatePath("/admin/ordrer");
  return { ok: true, updated: result.count };
}

// ─── Pickup: mark COLLECTED ───────────────────────────────────────────────────

export async function markCollectedAction(saleId: string): Promise<FulfillmentResult> {
  const staff = await requireRole(UserRole.FULFILLMENT_STAFF);

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { fulfillmentStatus: true, isPickup: true },
  });

  if (!sale) return { ok: false, error: "Ordre ikke funnet." };
  if (!sale.isPickup) return { ok: false, error: "Dette er ikke en hente-ordre." };
  if (sale.fulfillmentStatus !== FulfillmentStatus.READY_FOR_PICKUP) {
    return { ok: false, error: "Ordren er ikke klar for henting." };
  }

  await prisma.sale.update({
    where: { id: saleId },
    data:  { fulfillmentStatus: FulfillmentStatus.COLLECTED },
  });

  await logAudit(staff.id, "ORDER_COLLECTED", "Sale", saleId,
    { fulfillmentStatus: FulfillmentStatus.READY_FOR_PICKUP },
    { fulfillmentStatus: FulfillmentStatus.COLLECTED }
  );

  revalidatePath("/admin/batch");
  revalidatePath(`/admin/ordrer/${saleId}`);
  return { ok: true, updated: 1 };
}

// ─── Store cutoff configuration ───────────────────────────────────────────────

export async function updateStoreCutoffsAction(
  storeId: string,
  batchCutoffMorgen: string,
  batchCutoffEttermiddag: string
): Promise<FulfillmentResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  // Validate "HH:MM" format
  const hhmmPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmmPattern.test(batchCutoffMorgen) || !hhmmPattern.test(batchCutoffEttermiddag)) {
    return { ok: false, error: "Ugyldig klokkeslett. Bruk formatet HH:MM (f.eks. 11:00)." };
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { batchCutoffMorgen: true, batchCutoffEttermiddag: true },
  });
  if (!store) return { ok: false, error: "Butikk ikke funnet." };

  await prisma.store.update({
    where: { id: storeId },
    data:  { batchCutoffMorgen, batchCutoffEttermiddag },
  });

  await logAudit(admin.id, "STORE_CUTOFFS_UPDATED", "Store", storeId,
    { batchCutoffMorgen: store.batchCutoffMorgen, batchCutoffEttermiddag: store.batchCutoffEttermiddag },
    { batchCutoffMorgen, batchCutoffEttermiddag }
  );

  revalidatePath("/admin/butikk");
  revalidatePath("/admin/batch");
  return { ok: true, updated: 1 };
}

// ─── Void form-action wrappers ────────────────────────────────────────────────

export async function updateStoreCutoffsFormAction(
  storeId: string,
  formData: FormData
): Promise<void> {
  const morgen       = String(formData.get("batchCutoffMorgen")     ?? "11:00");
  const ettermiddag  = String(formData.get("batchCutoffEttermiddag") ?? "15:00");
  await updateStoreCutoffsAction(storeId, morgen, ettermiddag);
}

export async function markCollectedFormAction(
  saleId: string,
  _fd: FormData
): Promise<void> {
  await markCollectedAction(saleId);
}
