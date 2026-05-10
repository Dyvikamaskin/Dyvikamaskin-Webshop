import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyWebhookAuthorization,
} from "@/lib/vipps";
import { extendReservations, releaseReservations } from "@/services/inventory/reservations";
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

const AUTHORIZED_RESERVATION_TTL_MINUTES = 60 * 24; // 24h

// ─── Helper: log to AuditLog ──────────────────────────────────────────────────

async function logAuditEvent(
  action: string,
  targetId: string,
  payload: unknown,
) {
  try {
    const actor = await prisma.profile.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { id: true },
    });
    if (!actor) return;

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

// ─── AUTHORIZED handler — Phase 3 ──────────────────────────────────────────────
//
// Phase 2 behavior was "auto-capture-on-AUTHORIZED": on this webhook, decrement
// stock and call captureVippsPayment. That violates Forbrukerkjøpsloven §38 for
// B2C orders (cannot charge before dispatch).
//
// Phase 3 behavior: the webhook ONLY confirms the authorization. Stock stays
// reserved (not deducted), payment stays held (not captured). The actual
// capture + stock deduction happens at dispatch via captureSaleOnDispatch().

async function handleAuthorized(event: VippsWebhookEvent) {
  const { reference: checkoutSessionId, pspReference } = event;

  const sales = await prisma.sale.findMany({
    where: { checkoutSessionId, status: OrderStatus.PENDING },
    select: { id: true },
  });

  if (sales.length === 0) {
    console.warn(
      "[vipps-webhook] AUTHORIZED — no PENDING sales found for",
      checkoutSessionId,
    );
    return;
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mark every Sale in this checkout AUTHORIZED.
    await tx.sale.updateMany({
      where: { checkoutSessionId, status: OrderStatus.PENDING },
      data: {
        status: OrderStatus.AUTHORIZED,
        authorizedAt: now,
        vippsReference: pspReference ?? checkoutSessionId,
      },
    });

    // Extend reservations from the short checkout TTL to a 24h hold. Gives
    // operations a full day to dispatch before stock is auto-released.
    await extendReservations(checkoutSessionId, AUTHORIZED_RESERVATION_TTL_MINUTES, tx);
  });

  await logAuditEvent("VIPPS_AUTHORIZED", checkoutSessionId, {
    saleIds: sales.map((s) => s.id),
    pspReference,
  });
}

// ─── CAPTURED handler — Phase 3 ────────────────────────────────────────────────
//
// Vipps confirms our capture went through. The captureSaleOnDispatch() call
// already updated Sale.status = PAID and decremented stock. This handler is
// just observability: log it and release any leftover reservations.

async function handleCaptured(event: VippsWebhookEvent) {
  const { reference: checkoutSessionId, amount } = event;

  // Defensive: release reservations for this session if any remain.
  // captureSaleOnDispatch should have done it already; this is the
  // belt-and-braces second sweep in case capture was retried.
  await releaseReservations(checkoutSessionId);

  await logAuditEvent("VIPPS_CAPTURED", checkoutSessionId, {
    amountOre: amount.value,
    pspReference: event.pspReference,
  });
}

// ─── CANCELLED / ABORTED / EXPIRED handler — Phase 3 ───────────────────────────
//
// Authorization expired or was cancelled before dispatch. Release reservations
// and mark the Sale CANCELLED. Stock returns to available naturally because we
// never decremented it in the first place — that is the whole point of the
// new flow.

async function handleVoided(event: VippsWebhookEvent) {
  const { reference: checkoutSessionId, name } = event;

  await prisma.$transaction(async (tx) => {
    await tx.sale.updateMany({
      where: {
        checkoutSessionId,
        status: { in: [OrderStatus.PENDING, OrderStatus.AUTHORIZED] },
      },
      data: { status: OrderStatus.CANCELLED },
    });
    await releaseReservations(checkoutSessionId, tx);
  });

  await logAuditEvent(`VIPPS_${name}`, checkoutSessionId, {
    pspReference: event.pspReference,
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * POST /api/vipps/webhook
 *
 * Receives payment lifecycle events from Vipps.
 * Must return 200 quickly to prevent Vipps retries on timeout.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!verifyWebhookAuthorization(authHeader)) {
    console.error("[vipps-webhook] Unauthorized request — bad Authorization header");
    await logAuditEvent("WEBHOOK_AUTH_FAILURE", "unknown", {
      authHeader: authHeader?.slice(0, 20),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: VippsWebhookEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.info("[vipps-webhook] event received", event.name, event.reference);

  // Idempotency — skip if Vipps redelivered the same eventId. Each Vipps webhook
  // carries an idempotencyKey; we fall back to the pspReference + name +
  // reference triple when the key is absent so we never silently re-process.
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
      idempotencyId,
    );
  }

  try {
    switch (event.name) {
      case "AUTHORIZED":
        await handleAuthorized(event);
        break;

      case "CAPTURED":
        await handleCaptured(event);
        break;

      case "CANCELLED":
      case "ABORTED":
      case "EXPIRED":
      case "TERMINATED":
        await handleVoided(event);
        break;

      case "REFUNDED":
        // Refund flow lands in a follow-up; for now, just record it.
        await logAuditEvent("VIPPS_REFUNDED", event.reference, {
          amountOre: event.amount.value,
          pspReference: event.pspReference,
        });
        break;

      default:
        console.info("[vipps-webhook] unhandled event name:", event.name);
    }
  } catch (err) {
    console.error("[vipps-webhook] unhandled error", err);
    await markWebhookFailed(record.id, err);
    return NextResponse.json({ ok: false, error: "Internal error" });
  }

  await markWebhookProcessed(record.id);
  return NextResponse.json({ ok: true });
}
