/**
 * Rate-limit helpers — Phase 6 (Hardening)
 *
 * Built on @upstash/ratelimit + the existing UPSTASH_REDIS_REST_*
 * credentials. Each limiter is a singleton: created lazily on first
 * use and cached, so test environments without UPSTASH credentials
 * can import the module without crashing at boot.
 *
 * Two limiters defined here:
 *   * loginLimiter    — 5 attempts per 15 min, keyed by email.
 *                       Defends against credential-stuffing across many
 *                       passwords for the same account.
 *   * checkoutLimiter — 5 attempts per 60 s, keyed by profile id.
 *                       Defends against a buggy client or hostile script
 *                       triggering many parallel Vipps payment requests.
 *
 * Behaviour when Upstash is unreachable: `consume()` returns
 * `{ ok: true }` (fail-open). Rationale: a rate-limit subsystem outage
 * shouldn't take down logins or checkouts. The risk of fail-open is
 * brief; the risk of fail-closed is total auth outage.
 */
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export type ConsumeResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

let loginLimiterCached: Ratelimit | null = null;
let checkoutLimiterCached: Ratelimit | null = null;

function loginLimiter(): Ratelimit | null {
  if (loginLimiterCached) return loginLimiterCached;
  const r = getRedis();
  if (!r) return null;
  loginLimiterCached = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    analytics: false,
    prefix: "rl:login",
  });
  return loginLimiterCached;
}

function checkoutLimiter(): Ratelimit | null {
  if (checkoutLimiterCached) return checkoutLimiterCached;
  const r = getRedis();
  if (!r) return null;
  checkoutLimiterCached = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(5, "60 s"),
    analytics: false,
    prefix: "rl:checkout",
  });
  return checkoutLimiterCached;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Consume one login attempt for the given email (normalized to lower
 * case). Returns `{ ok: false, retryAfterSeconds }` once the 5/15min
 * threshold is exceeded.
 */
export async function consumeLoginAttempt(rawEmail: string): Promise<ConsumeResult> {
  const limiter = loginLimiter();
  if (!limiter) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  const key = rawEmail.trim().toLowerCase();
  try {
    const { success, reset, remaining } = await limiter.limit(key);
    if (!success) {
      return { ok: false, retryAfterSeconds: msToSeconds(reset - Date.now()) };
    }
    return { ok: true, remaining };
  } catch (err) {
    console.error("[ratelimit] login limiter failed; fail-open", err);
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }
}

/**
 * Consume one checkout attempt for the given profile id (or "anon-"
 * prefixed IP for unauthenticated cart sessions). Returns
 * `{ ok: false, retryAfterSeconds }` once the 5/60s threshold is exceeded.
 */
export async function consumeCheckoutAttempt(key: string): Promise<ConsumeResult> {
  const limiter = checkoutLimiter();
  if (!limiter) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  try {
    const { success, reset, remaining } = await limiter.limit(key);
    if (!success) {
      return { ok: false, retryAfterSeconds: msToSeconds(reset - Date.now()) };
    }
    return { ok: true, remaining };
  } catch (err) {
    console.error("[ratelimit] checkout limiter failed; fail-open", err);
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }
}

function msToSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}
