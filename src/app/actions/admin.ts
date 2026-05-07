"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildLocationCode } from "@/lib/location-code";
import {
  UserRole,
  OrderStatus,
  FulfillmentStatus,
} from "@/app/generated/prisma/enums";

// ─── Order actions ────────────────────────────────────────────────────────────

export type AdminActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Update the fulfillment status of an order.
 */
export async function updateFulfillmentStatusAction(
  saleId: string,
  fulfillmentStatus: FulfillmentStatus
): Promise<AdminActionResult> {
  const admin = await requireRole(UserRole.FULFILLMENT_STAFF);

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { fulfillmentStatus: true },
  });

  if (!sale) return { ok: false, error: "Ordre ikke funnet." };

  await prisma.sale.update({
    where: { id: saleId },
    data: { fulfillmentStatus },
  });

  await logAudit(
    admin.id,
    "ORDER_FULFILLMENT_UPDATED",
    "Sale",
    saleId,
    { fulfillmentStatus: sale.fulfillmentStatus },
    { fulfillmentStatus }
  );

  revalidatePath("/admin/ordrer");
  revalidatePath(`/admin/ordrer/${saleId}`);
  return { ok: true };
}

/**
 * Update the order status (PENDING → PAID → INVOICED).
 * Only STORE_MANAGER+ may change payment status.
 */
export async function updateOrderStatusAction(
  saleId: string,
  status: OrderStatus
): Promise<AdminActionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { status: true },
  });

  if (!sale) return { ok: false, error: "Ordre ikke funnet." };

  await prisma.sale.update({
    where: { id: saleId },
    data: { status, ...(status === OrderStatus.PAID ? { paidAt: new Date() } : {}) },
  });

  await logAudit(
    admin.id,
    "ORDER_STATUS_UPDATED",
    "Sale",
    saleId,
    { status: sale.status },
    { status }
  );

  revalidatePath("/admin/ordrer");
  revalidatePath(`/admin/ordrer/${saleId}`);
  return { ok: true };
}

// ─── Customer actions ─────────────────────────────────────────────────────────

export interface UpdateCustomerData {
  fullName?: string;
  phoneNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  defaultDiscount?: number;
  creditLimit?: number | null;
  isApprovedForInvoice?: boolean;
  isActive?: boolean;
}

/**
 * Update CRM fields on a customer profile.
 * Only STORE_MANAGER+ may change discounts, credit limits, and invoice approval.
 */
export async function updateCustomerAction(
  profileId: string,
  data: UpdateCustomerData
): Promise<AdminActionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const existing = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      fullName: true,
      defaultDiscount: true,
      creditLimit: true,
      isApprovedForInvoice: true,
      isActive: true,
    },
  });

  if (!existing) return { ok: false, error: "Kunde ikke funnet." };

  await prisma.profile.update({
    where: { id: profileId },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.postalCode !== undefined && { postalCode: data.postalCode }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.defaultDiscount !== undefined && {
        defaultDiscount: data.defaultDiscount,
      }),
      ...(data.creditLimit !== undefined && { creditLimit: data.creditLimit }),
      ...(data.isApprovedForInvoice !== undefined && {
        isApprovedForInvoice: data.isApprovedForInvoice,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  await logAudit(admin.id, "CUSTOMER_UPDATED", "Profile", profileId, existing, data);

  revalidatePath("/admin/kunder");
  revalidatePath(`/admin/kunder/${profileId}`);
  return { ok: true };
}

/**
 * Void-returning form action wrappers.
 *
 * Next.js requires <form action> handlers to return void | Promise<void>.
 * These wrappers pre-bind both id and enum value so the form just submits
 * an empty body (FormData is ignored).
 */
export async function updateOrderStatusFormAction(
  saleId: string,
  status: OrderStatus,
  _formData: FormData
): Promise<void> {
  await updateOrderStatusAction(saleId, status);
}

export async function updateFulfillmentStatusFormAction(
  saleId: string,
  status: FulfillmentStatus,
  _formData: FormData
): Promise<void> {
  await updateFulfillmentStatusAction(saleId, status);
}

/**
 * FormData-compatible wrapper for updateCustomerAction.
 * Called from the native <form action={...}> in the customer detail page.
 * Checkboxes are absent from FormData when unchecked, so absence → false.
 */
export async function updateCustomerFormAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  const creditLimitRaw = formData.get("creditLimit");
  const data: UpdateCustomerData = {
    defaultDiscount: parseFloat(String(formData.get("defaultDiscount") ?? "0")) || 0,
    creditLimit:
      creditLimitRaw && String(creditLimitRaw).trim() !== ""
        ? parseFloat(String(creditLimitRaw))
        : null,
    isApprovedForInvoice: formData.get("isApprovedForInvoice") === "true",
    isActive: formData.get("isActive") === "true",
  };
  await updateCustomerAction(profileId, data);
}

// ─── Location code actions ────────────────────────────────────────────────────

/**
 * Set or clear the location code on a StoreStock record.
 * Validates format and handles unique-constraint conflicts gracefully.
 *
 * @param storeStockId  StoreStock.id
 * @param parts         Five location segments; pass null/empty to clear.
 */
export async function updateLocationCodeAction(
  storeStockId: string,
  parts: {
    zone: string;
    aisle: string;
    rack: string;
    shelf: string;
    slot: string;
  } | null
): Promise<AdminActionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const existing = await prisma.storeStock.findUnique({
    where: { id: storeStockId },
    select: {
      locationCode: true,
      storeId: true,
      product: { select: { sku: true, name: true } },
    },
  });

  if (!existing) return { ok: false, error: "Lagerbeholdning ikke funnet." };

  // Build the new code (or null to clear)
  const newCode = parts ? buildLocationCode(parts) : null;

  if (parts && newCode === null) {
    return { ok: false, error: "Ugyldig lokasjonskode — kontroller feltene." };
  }

  try {
    await prisma.storeStock.update({
      where: { id: storeStockId },
      data: { locationCode: newCode },
    });
  } catch (err: unknown) {
    // PostgreSQL unique violation → code 23505
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("23505") || msg.toLowerCase().includes("unique")) {
      return {
        ok: false,
        error: `Lokasjonskode «${newCode}» er allerede i bruk i dette lageret.`,
      };
    }
    throw err;
  }

  await logAudit(
    admin.id,
    "LOCATION_CODE_UPDATED",
    "StoreStock",
    storeStockId,
    { locationCode: existing.locationCode },
    { locationCode: newCode }
  );

  revalidatePath("/admin/lager");
  return { ok: true };
}

/**
 * FormData wrapper — reads the five field values and calls updateLocationCodeAction.
 * A blank zone field means "clear the code".
 */
export async function updateLocationCodeFormAction(
  storeStockId: string,
  formData: FormData
): Promise<void> {
  const zone  = String(formData.get("zone")  ?? "").trim();
  const aisle = String(formData.get("aisle") ?? "").trim();
  const rack  = String(formData.get("rack")  ?? "").trim();
  const shelf = String(formData.get("shelf") ?? "").trim();
  const slot  = String(formData.get("slot")  ?? "").trim();

  const parts = zone ? { zone, aisle, rack, shelf, slot } : null;
  await updateLocationCodeAction(storeStockId, parts);
}
