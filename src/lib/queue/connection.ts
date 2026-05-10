/**
 * Shared ioredis connection for BullMQ — Phase 4
 *
 * BullMQ requires raw Redis protocol (TCP), not Upstash's REST API.
 * The TCP URL is at the "Connect" tab of the Upstash dashboard (look
 * for `rediss://default:<password>@<host>:6379`). Set it as REDIS_URL
 * in `.env` and Railway environment.
 *
 * The connection is created lazily on first use so test environments
 * (vitest) can import queue modules without needing a live Redis.
 */
import IORedis, { type Redis } from "ioredis";

let cached: Redis | null = null;

/**
 * Get the shared Redis connection. Throws if REDIS_URL is not set —
 * that's a hard requirement for the queue subsystem to function.
 */
export function getRedisConnection(): Redis {
  if (cached) return cached;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not configured. Set the Upstash TCP URL " +
        "(rediss://default:…@host:6379) in .env and the Railway " +
        "environment. BullMQ workers cannot start without it.",
    );
  }

  cached = new IORedis(url, {
    // BullMQ requires this — workers block-pop from Redis indefinitely.
    maxRetriesPerRequest: null,
    // Enable TLS for upstash hosts; ioredis infers from rediss:// scheme,
    // but be explicit for any other rediss provider.
    enableReadyCheck: true,
  });

  cached.on("error", (err) => {
    console.error("[redis] connection error", err);
  });

  return cached;
}

/** Close the cached connection — useful in tests and graceful shutdown. */
export async function disconnectRedis(): Promise<void> {
  if (cached) {
    await cached.quit();
    cached = null;
  }
}

/**
 * Whether the queue subsystem is configured to run. Callers that have a
 * direct fallback (e.g., a dev script that wants to enqueue or run inline)
 * can check this first and avoid throwing on a missing REDIS_URL.
 */
export function isQueueConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}
