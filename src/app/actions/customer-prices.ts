"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { CustomerPriceScope, UserRole } from "@/app/generated/prisma/enums";

export interface CustomerPriceInput {
  profileId: string;
  scope: CustomerPriceScope;
  scopeId?: string | null;
  discountPercent?: number | null;
  fixedPrice?: number | null;
  notes?: string;
}

export type CustomerPriceResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a CustomerPriceList row. Exactly one of discountPercent or
 * fixedPrice must be set. fixedPrice is only honored at PRODUCT scope
 * (admin should not set it on broader scopes; the pricing engine
 * silently ignores fixedPrice on non-PRODUCT scope, but we reject at
 * the form so we never accumulate misleading rows).
 */
export async function createCustomerPriceAction(
  input: CustomerPriceInput,
): Promise<CustomerPriceResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const hasPercent = input.discountPercent != null && !isNaN(input.discountPercent);
  const hasFixed = input.fixedPrice != null && !isNaN(input.fixedPrice);
  if (hasPercent && hasFixed) {
    return { ok: false, error: "Bare én av rabatt-prosent og fastpris kan settes." };
  }
  if (!hasPercent && !hasFixed) {
    return { ok: false, error: "Sett enten rabatt-prosent eller fastpris." };
  }
  if (hasFixed && input.scope !== CustomerPriceScope.PRODUCT) {
    return { ok: false, error: "Fastpris gjelder kun på PRODUKT-nivå." };
  }
  if (input.scope !== CustomerPriceScope.GLOBAL && !input.scopeId?.trim()) {
    return { ok: false, error: "Mål for prisregelen er påkrevd (kategori, merke eller produkt-SKU)." };
  }

  const created = await prisma.customerPriceList.create({
    data: {
      profileId: input.profileId,
      scope: input.scope,
      scopeId: input.scopeId?.trim() || null,
      discountPercent: hasPercent ? new Prisma.Decimal(input.discountPercent!) : null,
      fixedPrice: hasFixed ? new Prisma.Decimal(input.fixedPrice!) : null,
      notes: input.notes?.trim() || null,
    },
    select: { id: true },
  });

  await logAudit(admin.id, "CUSTOMER_PRICE_CREATED", "CustomerPriceList", created.id, null, {
    profileId: input.profileId,
    scope: input.scope,
    scopeId: input.scopeId,
    discountPercent: input.discountPercent,
    fixedPrice: input.fixedPrice,
  });

  revalidatePath(`/admin/kunder/${input.profileId}/priser`);
  return { ok: true, id: created.id };
}

export async function deleteCustomerPriceAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const before = await prisma.customerPriceList.findUnique({
    where: { id },
    select: { profileId: true, scope: true, scopeId: true, discountPercent: true, fixedPrice: true },
  });
  if (!before) return { ok: false, error: "Pristier ikke funnet." };

  await prisma.customerPriceList.delete({ where: { id } });
  await logAudit(admin.id, "CUSTOMER_PRICE_DELETED", "CustomerPriceList", id, before, null);

  revalidatePath(`/admin/kunder/${before.profileId}/priser`);
  return { ok: true };
}
