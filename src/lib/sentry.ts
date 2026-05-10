/**
 * Sentry helpers — Phase 4 follow-up
 *
 * Thin wrappers around @sentry/nextjs so the workers can report terminal
 * failures without each one knowing the SDK quirks. Sentry is imported
 * dynamically: if SENTRY_DSN isn't configured, init is a no-op and these
 * helpers cost nothing.
 *
 * `Sentry.captureException` is itself a no-op when init hasn't run, so we
 * don't need to gate the call site on "is Sentry on?".
 */
import type { Job } from "bullmq";

/**
 * Report a BullMQ job failure to Sentry. Called from each worker's
 * `failed` event handler.
 *
 * Only forwards *terminal* failures (attempts exhausted) so retries don't
 * flood Sentry with N copies of the same transient error.
 */
export async function reportJobFailure(
  queueName: string,
  job: Job | undefined,
  err: unknown,
): Promise<void> {
  if (job) {
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;
  }

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err, {
      tags: {
        queue: queueName,
        jobName: job?.name,
      },
      extra: {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        data: job?.data,
      },
    });
  } catch (importErr) {
    // A broken Sentry import must never bring down the worker. Log and
    // move on; the worker has already console.error'd the underlying job
    // failure separately.
    console.error("[sentry] failed to report job failure", importErr);
  }
}
