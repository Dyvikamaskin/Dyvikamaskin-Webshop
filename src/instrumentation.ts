/**
 * Next.js 16 instrumentation hook.
 *
 * Runs once per server process at boot. We use it to start BullMQ workers
 * (Phase 4 — co-host model, option A) so background jobs share the same
 * process as HTTP handlers.
 *
 * The `nodejs` runtime guard is mandatory: instrumentation also runs on
 * the edge runtime where ioredis isn't available.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startWorkers } = await import("@/lib/queue/start");
  startWorkers();
}
