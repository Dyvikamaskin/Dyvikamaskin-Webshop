import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { WebhookStatus } from "@/app/generated/prisma/enums";

/**
 * Inbound webhook idempotency, backed by the WebhookEvent table.
 *
 * Phase 1 (Sprint 0) of v4.1-implementation-plan.md introduces this as a
 * structural replacement for the stringly-typed AuditLog action check that
 * Vipps webhook handling used in v4. The shape is generic so it can be
 * reused by MyBring or any other inbound provider in later phases.
 */

export type RecordResult =
  | { status: "new"; id: string }
  | { status: "duplicate"; id: string; processedAt: Date | null }
  | { status: "in_flight"; id: string };

/**
 * Record an inbound webhook delivery and report whether it has been seen.
 *
 * - If no row exists for (provider, eventId): inserts one with status RECEIVED
 *   and returns "new". Caller should proceed with handling.
 * - If a row exists with status PROCESSED: returns "duplicate". Caller should
 *   short-circuit with a 200 OK and not re-run side effects.
 * - If a row exists with status RECEIVED or FAILED: returns "in_flight". The
 *   previous attempt did not complete; caller may choose to retry the side
 *   effects. The unique index guarantees only one in-flight handler at a
 *   time per event.
 */
export async function recordInboundWebhook(
  provider: string,
  eventId: string,
  payload: unknown
): Promise<RecordResult> {
  try {
    const row = await prisma.webhookEvent.create({
      data: {
        provider,
        eventId,
        payload: payload as Prisma.InputJsonValue,
        status: WebhookStatus.RECEIVED,
      },
      select: { id: true },
    });
    return { status: "new", id: row.id };
  } catch (err) {
    // P2002 = unique constraint violation on (provider, eventId)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider, eventId } },
        select: { id: true, status: true, processedAt: true },
      });
      if (!existing) {
        // Race-window edge case: row was deleted between INSERT and SELECT.
        // Treat as new and let the caller try again.
        return recordInboundWebhook(provider, eventId, payload);
      }
      if (existing.status === WebhookStatus.PROCESSED) {
        return { status: "duplicate", id: existing.id, processedAt: existing.processedAt };
      }
      return { status: "in_flight", id: existing.id };
    }
    throw err;
  }
}

/** Mark a previously recorded event as fully handled. Idempotent. */
export async function markWebhookProcessed(id: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id },
    data: { status: WebhookStatus.PROCESSED, processedAt: new Date() },
  });
}

/** Mark a previously recorded event as failed. Stores the error message. */
export async function markWebhookFailed(id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.webhookEvent.update({
    where: { id },
    data: { status: WebhookStatus.FAILED, errorMessage: message.slice(0, 1000) },
  });
}
