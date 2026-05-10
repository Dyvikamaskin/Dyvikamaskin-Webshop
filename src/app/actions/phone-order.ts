"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { validateCart } from "@/lib/cart";
import { determineBatchSlot } from "@/lib/batch";
import { enqueueNotification } from "@/lib/queue/notifications";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateInvoiceForSale } from "@/lib/invoice-service";
import { prisma } from "@/lib/prisma";
import {
  CustomerType,
  OrderSource,
  OrderStatus,
  FulfillmentStatus,
  DiscountSource,
  UserRole,
} from "@/app/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhoneOrderItem {
  sku: string;
  quantity: number;
}

export type PhoneOrderResult =
  | { ok: true; saleIds: string[]; checkoutSessionId: string }
  | { ok: false; error: string };

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Create a phone order on behalf of a customer.
 *
 * - Validates cart with fresh server-side pricing
 * - Creates Sale(s) with orderSource = PHONE and createdByAdminId set
 * - Auto-generates invoice immediately
 * - Writes audit log entry
 *
 * @param customerEmail  Must match an existing Profile
 * @param items          SKU + quantity pairs
 * @param isPickup       true = customer collects in store
 * @param dueDays        0 for immediate payment, 30 for net-30 invoice
 */
export async function createPhoneOrderAction(
  customerEmail: string,
  items: PhoneOrderItem[],
  isPickup: boolean,
  dueDays: number
): Promise<PhoneOrderResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  if (!items.length) {
    return { ok: false, error: "Legg til minst én vare." };
  }

  // Resolve customer
  const customer = await prisma.profile.findUnique({
    where: { email: customerEmail.trim().toLowerCase() },
    select: { id: true, customerType: true, defaultDiscount: true },
  });

  if (!customer) {
    return {
      ok: false,
      error: `Finner ingen kunde med e-post «${customerEmail}».`,
    };
  }

  // Validate cart (pricing + stock)
  const validated = await validateCart(items, {
    customerId: customer.id,
    customerType: customer.customerType as CustomerType,
    defaultDiscount: customer.defaultDiscount,
  });

  if (validated.splits.length === 0) {
    return { ok: false, error: "Ingen varer på lager." };
  }

  const checkoutSessionId = randomUUID();
  const saleIds: string[] = [];

  // Fetch batch cutoffs
  const storeIds = validated.splits.map((s) => s.storeId);
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, batchCutoffMorgen: true, batchCutoffEttermiddag: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  // Create Sale + SaleItems
  await prisma.$transaction(async (tx) => {
    for (const split of validated.splits) {
      const store = storeMap.get(split.storeId);
      const batchSlot = determineBatchSlot(
        store?.batchCutoffMorgen,
        store?.batchCutoffEttermiddag
      );

      const sale = await tx.sale.create({
        data: {
          checkoutSessionId,
          customerId: customer.id,
          createdByAdminId: admin.id,
          storeId: split.storeId,
          orderSource: OrderSource.PHONE,
          status: OrderStatus.PENDING,
          fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
          batchSlot,
          isPickup,
          subtotalExclMva: split.subtotalEx,
          mvaAmount: split.mvaAmount,
          totalPrice: split.totalInc,
        },
      });

      for (const item of split.items) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            sku: item.sku,
            productName: item.name,
            quantity: item.quantity,
            unitPriceExclMva: item.priceEx,
            mvaRate: item.mvaRate,
            lineTotalExclMva: item.lineTotalEx,
            lineTotalInclMva: item.lineTotalInc,
            discountSource: item.discountSource as DiscountSource,
            discountPercentage: item.discountPct,
            promotionId: item.promotionId ?? null,
          },
        });
      }

      saleIds.push(sale.id);
    }
  });

  // Auto-generate invoice and fire notifications for every sub-order
  for (const saleId of saleIds) {
    try {
      await generateInvoiceForSale(saleId, dueDays);
    } catch (err) {
      console.error("[phone-order] invoice generation failed", saleId, err);
    }
    await enqueueNotification({ kind: "order-confirmed", saleId });
  }

  await logAudit(admin.id, "PHONE_ORDER_CREATED", "Sale", checkoutSessionId, null, {
    customerId: customer.id,
    saleIds,
    isPickup,
    dueDays,
  });

  revalidatePath("/admin/ordrer");
  return { ok: true, saleIds, checkoutSessionId };
}
