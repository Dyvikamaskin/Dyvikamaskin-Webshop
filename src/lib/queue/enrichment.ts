/**
 * Enrichment queue — Phase 4
 *
 * Replaces the `void Promise.allSettled([enrichProductDirectly(sku),
 * runFitmentEnrichmentForProduct(sku)])` fire-and-forget pattern in
 * the manual-create and CSV-import server actions.
 *
 * Concurrency is intentionally low (1) because enrichment hits external
 * APIs (manufacturer lookups, LLM calls) that rate-limit aggressively
 * and can be slow. We'd rather queue up than parallelise.
 */
import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue/connection";
import { reportJobFailure } from "@/lib/sentry";

const QUEUE_NAME = "enrichment";

export interface EnrichmentJobData {
  sku: string;
}

let queue: Queue<EnrichmentJobData> | null = null;

function getQueue(): Queue<EnrichmentJobData> {
  if (!queue) {
    queue = new Queue<EnrichmentJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // Enrichment failures are usually transient API/timeouts; retry but
        // give up after a few attempts so a permanently-broken SKU doesn't
        // recycle forever.
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return queue;
}

/**
 * Enqueue an enrichment job for a single SKU. The handler runs both
 * `enrichProductDirectly` and `runFitmentEnrichmentForProduct` so callers
 * don't need to enqueue twice.
 */
export async function enqueueEnrichment(sku: string): Promise<void> {
  await getQueue().add("enrich", { sku });
}

export async function processEnrichmentJob(
  job: Job<EnrichmentJobData>,
): Promise<void> {
  const { enrichProductDirectly } = await import("@/lib/product-enrichment");
  const { runFitmentEnrichmentForProduct } = await import("@/lib/fitment-enrichment");

  // allSettled here (not all) because a failure on the fitment side
  // shouldn't lose the data enrichment, and vice versa. The handler logs
  // both outcomes; BullMQ retries the whole job only when one of them
  // throws an unhandled error.
  const results = await Promise.allSettled([
    enrichProductDirectly(job.data.sku),
    runFitmentEnrichmentForProduct(job.data.sku),
  ]);

  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (rejected.length > 0) {
    // Surface to BullMQ for retry tracking. The most informative error
    // wins for the job-failure log.
    throw rejected[0].reason;
  }
}

let worker: Worker<EnrichmentJobData> | null = null;

export function startEnrichmentWorker(): Worker<EnrichmentJobData> {
  if (worker) return worker;
  worker = new Worker<EnrichmentJobData>(QUEUE_NAME, processEnrichmentJob, {
    connection: getRedisConnection(),
    concurrency: 1, // protect upstream API rate limits
  });
  worker.on("failed", (job, err) => {
    console.error(
      "[enrichment] job failed",
      { jobId: job?.id, sku: job?.data?.sku, attemptsMade: job?.attemptsMade },
      err,
    );
    void reportJobFailure(QUEUE_NAME, job, err);
  });
  return worker;
}
