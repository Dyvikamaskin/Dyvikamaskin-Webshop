import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyWebhookAuthorization,
  captureVippsPayment,
  refundVippsPayment,
  toOre,
} from "@/lib/vipps";
import { generateInvoiceForSale } from "@/lib/invoice-service";
import { notifyOrderConfirmed, checkAndNotifyLowStock } from "@/lib/notification-service";
import { OrderStatus } from "@/app/generated/prisma/enums";
import {
  recordInboundWebhook,
  markWebhookProcessed,
  markWebhookFailed,
} from "@/lib/webhook-idempotency";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VippsWebhookEvent {
  msn: string;
  reference: string;
  pspReference?: string;
  name: string; // AUTHORIZED | CAPTURED | CANCELLED | REFUNDED | ABORTED | EXPIRED
  amount: { currency: string; value: number }; // value in øre
  timestamp: string;
  idempotencyKey?: string;
  success: boolean;
}

// ─── Helper: log to AuditLog ──────────────────────────────────────────────────

async function logAuditEvent(
  action: string,
  targetId: string,
  payload: unknown
) {
  // Use a system actor ID — "SYSTEM" as a placeholder since actor is required
  // In production, a dedicated system profile ID would be used.
  // We skip the DB write if no profile exists for "SYSTEM" and catch errors.
  try {
    // Find any SUPER_ADMIN to use as the audit actor
    const actor = await prisma.profile.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { id: true },
    });

    if (!actor) return; // No actor available — skip audit log for now

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        targetType: "Sale",
        targetId,
        newValue: payload as object,
      },
    });
  } catch (err) {
    console.error("[vipps-webhook] auditLog failed", err);
  }
}

// ─── AUTHORIZED handler ────────────────────────────────────────────────────────

async function handleAuthorized(event: VippsWebhookEvent) {
  const { reference: checkoutSessionId, amount, idempotencyKey } = event;
  const totalOre = amount.value;

  // Idempotency guard — skip if already processed
  if (idempotencyKey) {
    const existing = await prisma.auditLog.findFirst({
      where: { action: `VIPPS_AUTHORIZED:${idempotencyKey}` },
    });
    if (existing) {
      console.info("[vipps-webhook] duplicate AUTHORIZED, skipping", idempotencyKey);
      return;
    }
  }

  // Find all pending Sales for this checkout
  const sales = await prisma.sale.findMany({
    where: { checkoutSessionId, status: OrderStatus.PENDING },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          sku: true,
          quantity: true,
          lineTotalInclMva: true,
        },
      },
    },
  });

  if (sales.length === 0) {
    console.warn("[vipps-webhook] AUTHORIZED — no PENDING sales found for", checkoutSessionId);
    return;
  }

  const successfulSaleIds: string[] = [];
  const failedSales: typeof sales = [];

  // Attempt stock deduction for each Sale in a separate transaction
  for (const sale of sales) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const item of sale.items) {
          // Decrement stock at the sale's store
          const stockRow = await tx.storeStock.update({
            where: {
              productId_storeId: {
                productId: item.productId,
                storeId: sale.storeId,
              },
            },
            data: { quantity: { decrement: item.quantity } },
            select: { quantity: true },
          });

          if (stockRow.quantity < 0) {
            // Rollback by throwing inside the transaction
            throw new Error(
              `Insufficient stock for product ${item.sku} at store ${sale.storeId}`
            );
          }
        }

        // Mark Sale as PAID
        await tx.sale.update({
          where: { id: sale.id },
          data: { status: OrderStatus.PAID, paidAt: new Date() },
        });
      });

      successfulSaleIds.push(sale.id);

      // Low stock check after deduction (non-blocking)
      const deductedProductIds = sale.items.map((i) => i.productId);
      void checkAndNotifyLowStock(sale.storeId, deductedProductIds);
    } catch (stockError) {
      console.error("[vipps-webhook] stock deduction failed for sale", sale.id, stockError);
      failedSales.push(sale);
    }
  }

  // Capture the successful portion of the payment
  const successfulTotalInc = sales
    .filter((s) => successfulSaleIds.includes(s.id))
    .reduce((sum, s) => sum + s.totalPrice.toNumber(), 0);

  const failedTotalInc = failedSales.reduce(
    (sum, s) => sum + s.totalPrice.toNumber(),
    0
  );

  try {
    if (successfulTotalInc > 0) {
      await captureVippsPayment(checkoutSessionId, toOre(successfulTotalInc));
      await logAuditEvent(
        `VIPPS_AUTHORIZED${idempotencyKey ? `:${idempotencyKey}` : ""}`,
        checkoutSessionId,
        {
          capturedOre: toOre(successfulTotalInc),
          successfulSaleIds,
          failedSaleIds: failedSales.map((s) => s.id),
        }
      );
    }

    // Refund for any failed sub-orders
    if (failedTotalInc > 0 && successfulTotalInc > 0) {
      // Already captured — issue partial refund
      await refundVippsPayment(checkoutSessionId, toOre(failedTotalInc));
      await logAuditEvent("VIPPS_PARTIAL_REFUND", checkoutSessionId, {
        refundedOre: toOre(failedTotalInc),
        failedSaleIds: failedSales.map((s) => s.id),
        reason: "Insufficient stock",
      });
    } else if (failedTotalInc > 0 && successfulTotalInc === 0) {
      // Nothing succeeded — we captured 0, just log the failure
      // Vipps will auto-expire the authorisation
      await logAuditEvent("VIPPS_FULL_STOCK_FAILURE", checkoutSessionId, {
        failedSaleIds: failedSales.map((s) => s.id),
      });
    }
  } catch (vippsError) {
    console.error("[vipps-webhook] Vipps capture/refund error", vippsError);
    // Log for manual intervention
    await logAuditEvent("VIPPS_CAPTURE_ERROR", checkoutSessionId, {
      error: String(vippsError),
    });
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * POST /api/vipps/webhook
 *
 * Receives payment lifecycle events from Vipps.
 * Must return 200 quickly to prevent Vipps retries on timeout.
 */
export async function POST(request: NextRequest) {
  // 1. Verify Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!verifyWebhookAuthorization(authHeader)) {
    console.error("[vipps-webhook] Unauthorized request — bad Authorization header");
    await logAuditEvent("WEBHOOK_AUTH_FAILURE", "unknown", {
      authHeader: authHeader?.slice(0, 20), // partial for debugging
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse event
  let event: VippsWebhookEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.info("[vipps-webhook] event received", event.name, event.reference);

  // 3. Idempotency — skip if Vipps redelivered the same eventId.
  // Each Vipps webhook carries an idempotencyKey; we fall back to the
  // pspReference + name + reference triple when the key is absent so we
  // never silently re-process events.
  const idempotencyId =
    event.idempotencyKey ??
    `${event.reference}:${event.name}:${event.pspReference ?? "no-psp"}`;

  const record = await recordInboundWebhook("vipps", idempotencyId, event);
  if (record.status === "duplicate") {
    console.info("[vipps-webhook] duplicate delivery, skipping", idempotencyId);
    return NextResponse.json({ ok: true, deduplicated: true });
  }
  if (record.status === "in_flight") {
    console.warn(
      "[vipps-webhook] retry of an event that did not finish, retrying handler",
      idempotencyId
    );
    // Fall through and re-run the handler — the side effects are designed
    // to be idempotent (existing AuditLog check inside handleAuthorized
    // is the in-handler safety net during the Phase 1 transition).
  }

  // 4. Handle event
  try {
    switch (event.name) {
      case "AUTHORIZED":
        await handleAuthorized(event);
        break;

      case "CAPTURED": {
        // Auto-generate invoice (receipt) for all PAID sales in this session
        const capturedSales = await prisma.sale.findMany({
          where: {
            checkoutSessionId: event.reference,
            status: OrderStatus.PAID,
            invoiceNumber: null,
          },
          select: { id: true },
        });
        for (const s of capturedSales) {
          try {
            await generateInvoiceForSale(s.id, 0);
          } catch (invoiceErr) {
            console.error("[vipps-webhook] invoice generation failed for sale", s.id, invoiceErr);
          }
          // Order confirmed email (non-blocking)
          void notifyOrderConfirmed(s.id);
        }
        await logAuditEvent("VIPPS_CAPTURED", event.reference, {
          amountOre: event.amount.value,
          pspReference: event.pspReference,
          invoicesGenerated: capturedSales.length,
        });
        break;
      }

      case "REFUNDED":
      case "CANCELLED":
      case "ABORTED":
      case "EXPIRED":
      case "TERMINATED":
        await logAuditEvent(`VIPPS_${event.name}`, event.reference, {
          amountOre: event.amount.value,
          pspReference: event.pspReference,
          success: event.success,
        });
        break;

      default:
        console.info("[vipps-webhook] unhandled event name:", event.name);
    }
  } catch (err) {
    console.error("[vipps-webhook] unhandled error", err);
    await markWebhookFailed(record.id, err);
    // Return 200 anyway — Vipps will retry on non-2xx, causing double
    // processing. The WebhookEvent row stays FAILED so the next delivery
    // (if any) re-runs the handler from a clean state.
    return NextResponse.json({ ok: false, error: "Internal error" });
  }

  await markWebhookProcessed(record.id);
  return NextResponse.json({ ok: true });
}
