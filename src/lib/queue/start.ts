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
  started = true;
  console.info("[queue] workers started: notifications, enrichment");
}
