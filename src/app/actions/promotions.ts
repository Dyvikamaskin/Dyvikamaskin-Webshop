"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  UserRole,
  DiscountType,
  PromotionTargetType,
  PromotionAudience,
} from "@/app/generated/prisma/enums";

export type PromotionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export interface CreatePromotionData {
  name: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  targetType: PromotionTargetType;
  /** Product SKU, category slug, or brand name depending on targetType */
  targetId: string;
  startsAt: string; // ISO datetime string
  endsAt: string;
  appliesToCustomerType: PromotionAudience;
}

/**
 * Create a new promotion.
 */
export async function createPromotionAction(
  data: CreatePromotionData
): Promise<PromotionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  if (!data.name.trim()) {
    return { ok: false, error: "Navn er påkrevd." };
  }
  if (data.discountValue <= 0) {
    return { ok: false, error: "Rabattverdien må være positiv." };
  }
  if (data.discountType === DiscountType.PERCENTAGE && data.discountValue > 100) {
    return { ok: false, error: "Prosent-rabatt kan ikke overstige 100%." };
  }

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);

  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    return { ok: false, error: "Ugyldig dato." };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "Sluttdato må være etter startdato." };
  }

  const promotion = await prisma.promotion.create({
    data: {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      targetType: data.targetType,
      targetId: data.targetId.trim(),
      startsAt,
      endsAt,
      isActive: true,
      appliesToCustomerType: data.appliesToCustomerType,
      createdById: admin.id,
    },
  });

  await logAudit(admin.id, "PROMOTION_CREATED", "Promotion", promotion.id, null, data);

  revalidatePath("/admin/kampanjer");
  return { ok: true, id: promotion.id };
}

/**
 * Toggle a promotion's active status.
 */
export async function togglePromotionAction(
  promotionId: string,
  isActive: boolean
): Promise<PromotionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const existing = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { isActive: true, name: true },
  });

  if (!existing) return { ok: false, error: "Kampanje ikke funnet." };

  await prisma.promotion.update({
    where: { id: promotionId },
    data: { isActive },
  });

  await logAudit(
    admin.id,
    isActive ? "PROMOTION_ACTIVATED" : "PROMOTION_DEACTIVATED",
    "Promotion",
    promotionId,
    { isActive: existing.isActive },
    { isActive }
  );

  revalidatePath("/admin/kampanjer");
  return { ok: true };
}

/**
 * Void-returning form action wrapper for toggle.
 * Accepts pre-bound promotionId + isActive; ignores FormData.
 */
export async function togglePromotionFormAction(
  promotionId: string,
  isActive: boolean,
  _formData: FormData
): Promise<void> {
  await togglePromotionAction(promotionId, isActive);
}

/**
 * Void-returning form action wrapper for delete.
 * Accepts pre-bound promotionId; ignores FormData.
 */
export async function deletePromotionFormAction(
  promotionId: string,
  _formData: FormData
): Promise<void> {
  await deletePromotionAction(promotionId);
}

/**
 * Delete a promotion permanently.
 */
export async function deletePromotionAction(
  promotionId: string
): Promise<PromotionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const existing = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { name: true, isActive: true },
  });

  if (!existing) return { ok: false, error: "Kampanje ikke funnet." };

  await prisma.promotion.delete({ where: { id: promotionId } });

  await logAudit(
    admin.id,
    "PROMOTION_DELETED",
    "Promotion",
    promotionId,
    existing,
    null
  );

  revalidatePath("/admin/kampanjer");
  return { ok: true };
}
