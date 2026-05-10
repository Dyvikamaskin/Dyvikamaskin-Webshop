/**
 * Next.js 16 instrumentation hook.
 *
 * Runs once per server process at boot. We use it to:
 *   1. Initialize Sentry (if SENTRY_DSN is set) so server-side exceptions
 *      — including terminal BullMQ job failures — surface in the dashboard.
 *   2. Start BullMQ workers (Phase 4 — co-host model, option A) so
 *      background jobs share the same process as HTTP handlers.
 *
 * The `nodejs` runtime guard is mandatory: instrumentation also runs on
 * the edge runtime where ioredis and the Sentry Node SDK aren't available.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      // No tracing yet — exceptions only. Lift sampleRate above 0 when we
      // start using performance / spans.
      tracesSampleRate: 0,
      environment: process.env.NODE_ENV,
    });
  }

  const { startWorkers } = await import("@/lib/queue/start");
  startWorkers();
}
