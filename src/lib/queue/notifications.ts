/**
 * Notifications queue — Phase 4
 *
 * Replaces the `void notify*(saleId)` fire-and-forget pattern with a
 * BullMQ job. Failed sends are retried with exponential backoff and
 * surface in Sentry on final failure.
 *
 * The queue handler dispatches by job name to the existing notify* /
 * checkAndNotifyLowStock functions in `lib/notification-service.ts`.
 * Those functions stay the source of truth for what each event sends —
 * the queue is just transport + retry policy.
 */
import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue/connection";

const QUEUE_NAME = "notifications";

// ─── Job shapes ───────────────────────────────────────────────────────────────

export type NotificationJobName =
  | "order-confirmed"
  | "shipped"
  | "ready-for-pickup"
  | "low-stock"
  | "invoice-issued";

export type NotificationJobData =
  | { kind: "order-confirmed"; saleId: string }
  | { kind: "shipped"; saleId: string }
  | { kind: "ready-for-pickup"; saleId: string }
  | { kind: "low-stock"; storeId: string; productIds: string[] }
  | {
      kind: "invoice-issued";
      saleId: string;
      invoiceNumber: string;
      kidNumber: string;
      invoiceDueDate: Date;
      dueDays: number;
    };

// ─── Queue (producer) ─────────────────────────────────────────────────────────

let queue: Queue<NotificationJobData> | null = null;

function getQueue(): Queue<NotificationJobData> {
  if (!queue) {
    queue = new Queue<NotificationJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return queue;
}

/**
 * Enqueue a notification job. Drop-in replacement for the old
 * `void notifyShipped(saleId)` fire-and-forget pattern.
 */
export async function enqueueNotification(
  data: NotificationJobData,
): Promise<void> {
  await getQueue().add(data.kind, data);
}

// ─── Worker (consumer) ────────────────────────────────────────────────────────

/**
 * Dispatch a notification job to the right service function.
 *
 * Exported separately from `startNotificationsWorker()` so unit tests can
 * exercise it as a pure function without booting a real Worker.
 *
 * Imports are lazy because notification-service is "use server" and
 * invoice-service pulls the PDF renderer (heavy) — both stay out of the
 * dev-server cold path until a job actually fires.
 */
export async function processNotificationJob(
  job: Job<NotificationJobData>,
): Promise<void> {
  switch (job.data.kind) {
    case "order-confirmed": {
      const { notifyOrderConfirmed } = await import("@/lib/notification-service");
      await notifyOrderConfirmed(job.data.saleId);
      return;
    }
    case "shipped": {
      const { notifyShipped } = await import("@/lib/notification-service");
      await notifyShipped(job.data.saleId);
      return;
    }
    case "ready-for-pickup": {
      const { notifyReadyForPickup } = await import("@/lib/notification-service");
      await notifyReadyForPickup(job.data.saleId);
      return;
    }
    case "low-stock": {
      const { checkAndNotifyLowStock } = await import("@/lib/notification-service");
      await checkAndNotifyLowStock(job.data.storeId, job.data.productIds);
      return;
    }
    case "invoice-issued": {
      const { sendInvoiceNotification } = await import("@/lib/invoice-service");
      await sendInvoiceNotification(
        job.data.saleId,
        job.data.invoiceNumber,
        job.data.kidNumber,
        job.data.invoiceDueDate,
        job.data.dueDays,
      );
      return;
    }
    default: {
      // exhaustiveness — TS catches missing cases
      const _exhaustive: never = job.data;
      throw new Error(`Unknown notification job: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

let worker: Worker<NotificationJobData> | null = null;

export function startNotificationsWorker(): Worker<NotificationJobData> {
  if (worker) return worker;
  worker = new Worker<NotificationJobData>(QUEUE_NAME, processNotificationJob, {
    connection: getRedisConnection(),
    concurrency: 5,
  });
  worker.on("failed", (job, err) => {
    console.error(
      "[notifications] job failed",
      { jobId: job?.id, kind: job?.data?.kind, attemptsMade: job?.attemptsMade },
      err,
    );
  });
  return worker;
}
