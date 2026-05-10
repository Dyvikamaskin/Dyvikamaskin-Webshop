/**
 * Maintenance queue — Phase 4 follow-up (BullMQ-cron migration)
 *
 * Hosts repeating "housekeeping" jobs that previously ran via the
 * Railway `curl` cron service hitting an HTTP endpoint. Today this is
 * just `expire-reservations`; future daily-backup at 02:00 UTC and the
 * stale-backup nag will land here too.
 *
 * Why a separate queue from notifications/enrichment:
 *   - Different retention policy (these jobs are tiny + idempotent;
 *     we don't need long history)
 *   - Different concurrency requirement (these are cheap DB sweeps)
 *   - Mixing repeating cron jobs with on-demand jobs in the same queue
 *     muddles the failure semantics — easier to triage when "what is
 *     this cron tick doing?" lives in its own queue
 *
 * Scheduling uses `upsertJobScheduler` (BullMQ 5+) so calling
 * `scheduleRecurringJobs()` on every worker boot is idempotent — the
 * schedule entry is created once and updated in place on subsequent
 * boots. If Railway scales to multiple instances, all of them call
 * upsert; BullMQ deduplicates ticks via Redis locks so the job still
 * fires once per scheduled time.
 */
import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue/connection";
import { reportJobFailure } from "@/lib/sentry";

const QUEUE_NAME = "maintenance";

// ─── Job shapes ───────────────────────────────────────────────────────────────

export type MaintenanceJobName = "expire-reservations";

export type MaintenanceJobData = { kind: "expire-reservations" };

// ─── Queue (producer + scheduler) ─────────────────────────────────────────────

let queue: Queue<MaintenanceJobData> | null = null;

function getQueue(): Queue<MaintenanceJobData> {
  if (!queue) {
    queue = new Queue<MaintenanceJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // Maintenance jobs are idempotent and cheap — one retry is plenty.
        // If a tick fails, the next scheduled tick is right behind it.
        attempts: 2,
        backoff: { type: "fixed", delay: 10_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queue;
}

/**
 * Install / update the cron schedules for every recurring job.
 * Idempotent — calling multiple times is safe.
 */
export async function scheduleRecurringJobs(): Promise<void> {
  const q = getQueue();

  // expire-reservations: every minute. Matches the cadence the Railway
  // curl-cron service used. Reservation TTL defaults to 15 minutes so
  // a one-minute sweep is well within tolerance; tightening to 30s or
  // loosening to 5min are both safe — picked 1min for parity.
  await q.upsertJobScheduler(
    "expire-reservations-cron",
    { pattern: "* * * * *" },
    { name: "expire-reservations", data: { kind: "expire-reservations" } },
  );
}

// ─── Worker (consumer) ────────────────────────────────────────────────────────

/**
 * Dispatch a maintenance job. Exported separately from
 * `startMaintenanceWorker` so tests can exercise the dispatcher without
 * booting BullMQ.
 *
 * Imports are lazy so the dev cold path doesn't pay for Prisma + the
 * reservations module unless a tick actually fires.
 */
export async function processMaintenanceJob(
  job: Job<MaintenanceJobData>,
): Promise<void> {
  switch (job.data.kind) {
    case "expire-reservations": {
      const { expireReservations } = await import(
        "@/services/inventory/reservations"
      );
      const removed = await expireReservations();
      if (removed > 0) {
        console.info("[maintenance] expired reservations", { removed });
      }
      return;
    }
    default: {
      const _exhaustive: never = job.data.kind;
      throw new Error(`Unknown maintenance job: ${String(_exhaustive)}`);
    }
  }
}

let worker: Worker<MaintenanceJobData> | null = null;

export function startMaintenanceWorker(): Worker<MaintenanceJobData> {
  if (worker) return worker;
  worker = new Worker<MaintenanceJobData>(QUEUE_NAME, processMaintenanceJob, {
    connection: getRedisConnection(),
    // One at a time — maintenance jobs are tiny and we don't want a
    // backlog of overlapping sweeps if Redis hiccups briefly.
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    console.error(
      "[maintenance] job failed",
      { jobId: job?.id, kind: job?.data?.kind, attemptsMade: job?.attemptsMade },
      err,
    );
    void reportJobFailure(QUEUE_NAME, job, err);
  });
  return worker;
}
