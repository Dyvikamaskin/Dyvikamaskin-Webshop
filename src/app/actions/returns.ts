"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { refundVippsPayment, toOre } from "@/lib/vipps";
import {
  ReturnReason,
  ReturnRequestStatus,
  UserRole,
} from "@/app/generated/prisma/enums";

// ─── Customer-facing: create a return request ────────────────────────────────

export interface CreateReturnInput {
  saleId: string;
  reason: ReturnReason;
  notes?: string;
  items: { saleItemId: string; quantity: number }[];
}

export type CreateReturnResult =
  | { ok: true; returnRequestId: string }
  | { ok: false; error: string };

export async function createReturnRequestAction(
  input: CreateReturnInput,
): Promise<CreateReturnResult> {
  const user = await requireAuth();

  // Only the sale's customer can open a return on it.
  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    select: { id: true, customerId: true, status: true, items: { select: { id: true, quantity: true } } },
  });
  if (!sale) return { ok: false, error: "Ordre ikke funnet." };
  if (sale.customerId !== user.id) {
    return { ok: false, error: "Du kan kun opprette retur for egne ordrer." };
  }
  if (input.items.length === 0) {
    return { ok: false, error: "Velg minst én vare å returnere." };
  }

  // Validate every line: quantity ≤ purchased quantity.
  const saleItemById = new Map(sale.items.map((i) => [i.id, i.quantity]));
  for (const it of input.items) {
    const max = saleItemById.get(it.saleItemId);
    if (max == null) return { ok: false, error: "Ugyldig vare i returforespørsel." };
    if (it.quantity < 1 || it.quantity > max) {
      return {
        ok: false,
        error: `Returantall må være mellom 1 og ${max} for hver vare.`,
      };
    }
  }

  const created = await prisma.returnRequest.create({
    data: {
      saleId: input.saleId,
      customerId: user.id,
      reason: input.reason,
      notes: input.notes?.trim() || null,
      items: {
        create: input.items.map((it) => ({
          saleItemId: it.saleItemId,
          quantity: it.quantity,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/konto/retur");
  revalidatePath("/admin/retur");
  return { ok: true, returnRequestId: created.id };
}

// ─── Admin: approve / reject / refund ────────────────────────────────────────

export type AdminReturnResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveReturnAction(
  returnRequestId: string,
): Promise<AdminReturnResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  await prisma.returnRequest.update({
    where: { id: returnRequestId },
    data: { status: ReturnRequestStatus.APPROVED, approvedAt: new Date() },
  });
  await logAudit(admin.id, "RETURN_APPROVED", "ReturnRequest", returnRequestId, null, null);
  revalidatePath("/admin/retur");
  revalidatePath(`/admin/retur/${returnRequestId}`);
  return { ok: true };
}

export async function rejectReturnAction(
  returnRequestId: string,
  adminNotes: string,
): Promise<AdminReturnResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  await prisma.returnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: ReturnRequestStatus.REJECTED,
      rejectedAt: new Date(),
      adminNotes: adminNotes.trim() || null,
    },
  });
  await logAudit(admin.id, "RETURN_REJECTED", "ReturnRequest", returnRequestId, null, { adminNotes });
  revalidatePath("/admin/retur");
  return { ok: true };
}

export async function markReturnReceivedAction(
  returnRequestId: string,
): Promise<AdminReturnResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  await prisma.returnRequest.update({
    where: { id: returnRequestId },
    data: { status: ReturnRequestStatus.RECEIVED, receivedAt: new Date() },
  });
  await logAudit(admin.id, "RETURN_RECEIVED", "ReturnRequest", returnRequestId, null, null);
  revalidatePath("/admin/retur");
  return { ok: true };
}

/**
 * Process the refund. Calls Vipps refund if the original Sale was paid
 * via Vipps; otherwise just marks REFUNDED so the admin can issue the
 * refund manually via bank transfer.
 *
 * Refund amount can be partial — caller passes the kroner amount.
 */
export async function refundReturnAction(
  returnRequestId: string,
  refundAmount: string,
): Promise<AdminReturnResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const amountDecimal = new Prisma.Decimal(refundAmount);
  if (amountDecimal.lte(0)) {
    return { ok: false, error: "Refunderingsbeløp må være > 0." };
  }

  const rr = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: { sale: { select: { vippsReference: true, checkoutSessionId: true, totalPrice: true } } },
  });
  if (!rr) return { ok: false, error: "Returforespørsel ikke funnet." };
  if (amountDecimal.gt(rr.sale.totalPrice)) {
    return { ok: false, error: "Refunderingsbeløp kan ikke overstige ordrebeløp." };
  }

  let vippsRefundReference: string | null = null;
  if (rr.sale.vippsReference) {
    try {
      await refundVippsPayment(
        rr.sale.checkoutSessionId,
        toOre(amountDecimal),
      );
      // Vipps's refund API doesn't return a separate reference today;
      // we tag with the timestamp so the audit row is unique. Later,
      // when Vipps webhooks deliver REFUNDED, the pspReference can be
      // back-filled by the webhook handler.
      vippsRefundReference = `pending:${new Date().toISOString()}`;
    } catch (err) {
      console.error("[refundReturn] vipps refund failed", err);
      return {
        ok: false,
        error: `Vipps-refundering feilet: ${err instanceof Error ? err.message : "ukjent feil"}`,
      };
    }
  }

  await prisma.returnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: ReturnRequestStatus.REFUNDED,
      refundedAt: new Date(),
      refundAmount: amountDecimal,
      vippsRefundReference,
    },
  });
  await logAudit(admin.id, "RETURN_REFUNDED", "ReturnRequest", returnRequestId, null, {
    refundAmount: amountDecimal.toString(),
    vippsRefundReference,
  });

  revalidatePath("/admin/retur");
  return { ok: true };
}
