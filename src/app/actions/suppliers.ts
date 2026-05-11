"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { UserRole } from "@/app/generated/prisma/enums";

export interface SupplierInput {
  name: string;
  orgNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  notes?: string;
  isActive?: boolean;
}

export type SupplierResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createSupplierAction(
  data: SupplierInput,
): Promise<SupplierResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  if (!data.name?.trim()) return { ok: false, error: "Navn er påkrevd." };

  const created = await prisma.supplier.create({
    data: {
      name: data.name.trim(),
      orgNumber: data.orgNumber?.trim() || null,
      email: data.email?.trim().toLowerCase() || null,
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      city: data.city?.trim() || null,
      notes: data.notes?.trim() || null,
      isActive: data.isActive ?? true,
    },
    select: { id: true },
  });

  await logAudit(admin.id, "SUPPLIER_CREATED", "Supplier", created.id, null, {
    name: data.name,
  });

  revalidatePath("/admin/leverandorer");
  return { ok: true, id: created.id };
}

export async function updateSupplierAction(
  id: string,
  data: SupplierInput,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  if (!data.name?.trim()) return { ok: false, error: "Navn er påkrevd." };

  const before = await prisma.supplier.findUnique({
    where: { id },
    select: { name: true, orgNumber: true, email: true, isActive: true },
  });
  if (!before) return { ok: false, error: "Leverandør ikke funnet." };

  await prisma.supplier.update({
    where: { id },
    data: {
      name: data.name.trim(),
      orgNumber: data.orgNumber?.trim() || null,
      email: data.email?.trim().toLowerCase() || null,
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      city: data.city?.trim() || null,
      notes: data.notes?.trim() || null,
      isActive: data.isActive ?? before.isActive,
    },
  });

  await logAudit(admin.id, "SUPPLIER_UPDATED", "Supplier", id, before, data);
  revalidatePath("/admin/leverandorer");
  revalidatePath(`/admin/leverandorer/${id}`);
  return { ok: true };
}

export async function setProductSupplierAction(
  productSku: string,
  supplierId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  const product = await prisma.product.findUnique({
    where: { sku: productSku },
    select: { id: true, preferredSupplierId: true },
  });
  if (!product) return { ok: false, error: "Produkt ikke funnet." };

  await prisma.product.update({
    where: { id: product.id },
    data: { preferredSupplierId: supplierId },
  });

  await logAudit(
    admin.id,
    "PRODUCT_SUPPLIER_UPDATED",
    "Product",
    product.id,
    { preferredSupplierId: product.preferredSupplierId },
    { preferredSupplierId: supplierId },
  );

  revalidatePath(`/admin/produkter/${productSku}/rediger`);
  return { ok: true };
}
