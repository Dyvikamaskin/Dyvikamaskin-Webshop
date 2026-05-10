/**
 * Capture-on-dispatch — Phase 3
 *
 * The single entry point for committing a Sale at the moment of physical
 * dispatch. Behavior depends on payment path:
 *
 *   * Vipps path (vippsReference set, not yet captured):
 *       1. Capture the Vipps authorization for the line total
 *       2. Decrement StoreStock for each SaleItem
 *       3. Release the session's reservations
 *       4. Update Sale: status=PAID, paidAt, capturedAt, capturedAmount
 *
 *   * Invoice path (no vippsReference):
 *       1. Decrement StoreStock for each SaleItem
 *       2. Release the session's reservations
 *       (status remains AUTHORIZED/INVOICED — admin reconciles payment
 *        separately when the bank transfer lands.)
 *
 * Both paths converge on stock+reservations bookkeeping; only the Vipps
 * path triggers an external payment side effect.
 *
 * Kill-switch — VIPPS_DISABLE_CAPTURE
 *   When set ("1" or "true"), the Vipps capture API call is skipped on
 *   the Vipps path. Stock still decrements and reservations still release
 *   so warehouse can dispatch parcels during a Vipps outage. The Sale
 *   stays at AUTHORIZED — admin must reconcile capture via the Vipps
 *   portal (or by clearing the flag and re-running this entry point)
 *   once Vipps is back online.
 */
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { captureVippsPayment, toOre } from "@/lib/vipps";
import { releaseReservations } from "@/services/inventory/reservations";
import { OrderStatus } from "@/app/generated/prisma/enums";

export type DispatchResult =
  | { ok: true; captured: boolean; capturedAmount?: string; captureSuppressed?: boolean }
  | { ok: false; error: string };

/**
 * Env-driven kill-switch. Read at call time (not module load) so toggling
 * the flag on Railway takes effect on the next dispatch without a redeploy.
 */
function isVippsCaptureDisabled(): boolean {
  const v = process.env.VIPPS_DISABLE_CAPTURE;
  if (!v) return false;
  const lowered = v.toLowerCase();
  return lowered === "1" || lowered === "true";
}

/**
 * Commit a Sale at dispatch — capture payment (if Vipps) and consume stock.
 *
 * Idempotent for the Vipps capture: if Sale.capturedAt is already set, the
 * Vipps call is skipped. The stock decrement is also skipped when shippedAt
 * is already populated, so a double-trigger from the admin UI doesn't
 * decrement twice.
 */
export async function captureSaleOnDispatch(saleId: string): Promise<DispatchResult> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      checkoutSessionId: true,
      storeId: true,
      status: true,
      vippsReference: true,
      capturedAt: true,
      shippedAt: true,
      totalPrice: true,
      items: {
        select: { productId: true, sku: true, quantity: true },
      },
    },
  });

  if (!sale) return { ok: false, error: "Ordre ikke funnet." };

  const isVippsPath = sale.vippsReference !== null;
  const alreadyCaptured = sale.capturedAt !== null;
  const alreadyShipped = sale.shippedAt !== null;
  const captureSuppressed =
    isVippsPath && !alreadyCaptured && isVippsCaptureDisabled();

  if (captureSuppressed) {
    console.warn(
      "[captureSaleOnDispatch] VIPPS_DISABLE_CAPTURE active — Vipps capture skipped, " +
        "Sale stays AUTHORIZED. Reconcile capture via Vipps portal once back online.",
      { saleId, totalPrice: sale.totalPrice.toString() },
    );
  }

  // 1. Capture via Vipps if applicable. Done OUTSIDE the DB transaction so
  // the external API call doesn't hold a long-lived database lock.
  let capturedAmount: Prisma.Decimal | undefined;
  if (isVippsPath && !alreadyCaptured && !captureSuppressed) {
    try {
      await captureVippsPayment(sale.checkoutSessionId, toOre(sale.totalPrice));
      capturedAmount = sale.totalPrice;
    } catch (err) {
      console.error("[captureSaleOnDispatch] Vipps capture failed", saleId, err);
      return {
        ok: false,
        error:
          "Vipps-trekket feilet. Ordren forblir i status AUTHORIZED — prøv igjen eller kontakt Vipps-support.",
      };
    }
  } else if (isVippsPath && alreadyCaptured) {
    capturedAmount = sale.totalPrice;
  }

  // 2. DB updates: stock + reservations + Sale status.
  await prisma.$transaction(async (tx) => {
    if (!alreadyShipped) {
      for (const item of sale.items) {
        await tx.storeStock.update({
          where: {
            productId_storeId: {
              productId: item.productId,
              storeId: sale.storeId,
            },
          },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    await releaseReservations(sale.checkoutSessionId, tx);

    if (isVippsPath && !alreadyCaptured && !captureSuppressed) {
      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          capturedAt: new Date(),
          capturedAmount: sale.totalPrice,
        },
      });
    }
  });

  return {
    ok: true,
    captured: isVippsPath && !alreadyCaptured && !captureSuppressed,
    capturedAmount: capturedAmount?.toString(),
    ...(captureSuppressed ? { captureSuppressed: true } : {}),
  };
}
