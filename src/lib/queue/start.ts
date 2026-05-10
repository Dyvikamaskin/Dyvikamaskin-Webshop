/**
 * Queue bootstrapper — Phase 4
 *
 * Single entry point for booting every BullMQ Worker the app runs.
 * Called from `src/instrumentation.ts` on the Node.js runtime.
 *
 * Co-host model (Phase 4 decision A): the workers run inside the same
 * Next.js process as HTTP. If memory pressure ever forces option B,
 * extract this file's body to a separate `worker.ts` entry point and
 * remove the call from instrumentation.ts.
 */
import { isQueueConfigured } from "@/lib/queue/connection";
import { startNotificationsWorker } from "@/lib/queue/notifications";
import { startEnrichmentWorker } from "@/lib/queue/enrichment";
import {
  scheduleRecurringJobs,
  startMaintenanceWorker,
} from "@/lib/queue/maintenance";

let started = false;

export function startWorkers(): void {
  if (started) return;
  if (!isQueueConfigured()) {
    console.warn(
      "[queue] REDIS_URL not set — workers NOT started. " +
        "Background jobs will not run until configured.",
    );
    return;
  }

  startNotificationsWorker();
  startEnrichmentWorker();
  startMaintenanceWorker();

  // Cron schedules are installed on every boot. upsertJobScheduler is
  // idempotent so this is safe even under multi-instance Railway. Fire
  // and forget — a failure to install the schedule should not bring
  // down the worker process; it'll be retried next boot.
  void scheduleRecurringJobs().catch((err) => {
    console.error("[queue] failed to install recurring schedules", err);
  });

  started = true;
  console.info(
    "[queue] workers started: notifications, enrichment, maintenance",
  );
}
