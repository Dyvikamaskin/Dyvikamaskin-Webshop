"use server";

import { randomUUID } from "crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { validateCart } from "@/lib/cart";
import { createVippsPayment, toOre } from "@/lib/vipps";
import { determineBatchSlot } from "@/lib/batch";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  reserveStock,
  attachReservationsToSale,
  releaseReservations,
  type ReserveStockItem,
} from "@/services/inventory/reservations";
import { CustomerType, OrderSource, OrderStatus, FulfillmentStatus, DiscountSource } from "@/app/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutItem {
  sku: string;
  quantity: number;
}

export type InitiateCheckoutResult =
  | { ok: true; redirectUrl: string; checkoutSessionId: string }
  | { ok: false; error: string };

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Initiate a Vipps ePayment checkout.
 *
 * 1. Re-validates the cart server-side (fresh prices + stock)
 * 2. Creates Sale + SaleItem records (status PENDING) — one Sale per store
 * 3. Calls Vipps createPayment → gets redirectUrl
 * 4. Returns the Vipps redirect URL to the client
 *
 * The caller is responsible for redirecting the user to `redirectUrl`.
 */
export async function initiateCheckoutAction(
  items: CheckoutItem[]
): Promise<InitiateCheckoutResult> {
  try {
    if (!items.length) {
      return { ok: false, error: "Handlekurven er tom." };
    }

    // 1. Resolve customer profile
    const authUser = await getAuthUser();
    let customerProfile:
      | {
          customerId: string;
          customerType: CustomerType;
          defaultDiscount: Prisma.Decimal | string;
        }
      | undefined;

    if (authUser) {
      const profile = await prisma.profile.findUnique({
        where: { id: authUser.id },
        select: { id: true, customerType: true, defaultDiscount: true },
      });
      if (profile) {
        customerProfile = {
          customerId: profile.id,
          customerType: profile.customerType as CustomerType,
          defaultDiscount: profile.defaultDiscount,
        };
      }
    }

    // 2. Validate cart (pricing + stock)
    const validated = await validateCart(items, customerProfile);

    if (validated.splits.length === 0) {
      return { ok: false, error: "Ingen gyldige varer i handlekurven." };
    }

    if (new Prisma.Decimal(validated.grandTotalInc).lte(0)) {
      return { ok: false, error: "Totalbeløp kan ikke være 0." };
    }

    // 3. Generate checkoutSessionId (= Vipps payment reference)
    const checkoutSessionId = randomUUID();

    // 4. Reserve stock BEFORE creating the Vipps payment. Hard-fails the
    //    checkout if any item is no longer available. This is the race-
    //    fence: two parallel checkouts for the last unit can't both pass.
    const reservationItems: ReserveStockItem[] = [];
    for (const split of validated.splits) {
      for (const item of split.items) {
        reservationItems.push({
          productId: item.productId,
          storeId: split.storeId,
          quantity: item.quantity,
        });
      }
    }
    const reservation = await reserveStock(checkoutSessionId, reservationItems);
    if (!reservation.ok) {
      return {
        ok: false,
        error: "En av varene er ikke lenger på lager. Oppdater handlekurven og prøv igjen.",
      };
    }

    // 5. Fetch store batch cutoffs
    const storeIds = validated.splits.map((s) => s.storeId);
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, batchCutoffMorgen: true, batchCutoffEttermiddag: true },
    });
    const storeMap = new Map(stores.map((s) => [s.id, s]));

    // 6. Create Sale + SaleItem records in a transaction, attaching
    //    reservations to each Sale as we go.
    try {
      await prisma.$transaction(async (tx) => {
        for (const split of validated.splits) {
          const store = storeMap.get(split.storeId);
          const batchSlot = determineBatchSlot(
            store?.batchCutoffMorgen,
            store?.batchCutoffEttermiddag,
          );

          const sale = await tx.sale.create({
            data: {
              checkoutSessionId,
              customerId: customerProfile?.customerId ?? null,
              storeId: split.storeId,
              orderSource: OrderSource.ONLINE,
              status: OrderStatus.PENDING,
              fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
              batchSlot,
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

          await attachReservationsToSale(checkoutSessionId, split.storeId, sale.id, tx);
        }
      });
    } catch (createError) {
      // Sale creation failed after reservation succeeded — release the hold.
      await releaseReservations(checkoutSessionId).catch(() => {});
      throw createError;
    }

    // 7. Initiate Vipps payment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const returnUrl = `${appUrl}/betaling/bekreftelse?reference=${checkoutSessionId}`;

    try {
      const { redirectUrl } = await createVippsPayment({
        reference: checkoutSessionId,
        amountInOre: toOre(validated.grandTotalInc),
        returnUrl,
        description: "Bestilling hos Dyvikamaskin",
      });
      return { ok: true, redirectUrl, checkoutSessionId };
    } catch (vippsError) {
      // Vipps couldn't accept the payment — release reservations and mark
      // the freshly-created Sale rows CANCELLED so they don't pollute the
      // PENDING bucket.
      await prisma.$transaction(async (tx) => {
        await tx.sale.updateMany({
          where: { checkoutSessionId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.CANCELLED },
        });
        await releaseReservations(checkoutSessionId, tx);
      });
      throw vippsError;
    }
  } catch (error) {
    console.error("[initiateCheckoutAction]", error);
    return {
      ok: false,
      error: "Det oppstod en feil ved oppstart av betaling. Prøv igjen.",
    };
  }
}
