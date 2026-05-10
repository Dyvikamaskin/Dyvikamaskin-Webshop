import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// We control whether @upstash/redis is "configured" by toggling env vars
// before each test. The cached singletons inside ratelimit.ts mean we
// must dynamically re-import after each env change.
const ORIGINAL = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL.url) process.env.UPSTASH_REDIS_REST_URL = ORIGINAL.url;
  else delete process.env.UPSTASH_REDIS_REST_URL;
  if (ORIGINAL.token) process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL.token;
  else delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("ratelimit — fail-open when Upstash is unconfigured", () => {
  it("consumeLoginAttempt returns ok=true when UPSTASH env is missing", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { consumeLoginAttempt } = await import("@/lib/ratelimit");
    const result = await consumeLoginAttempt("user@example.com");
    expect(result.ok).toBe(true);
  });

  it("consumeCheckoutAttempt returns ok=true when UPSTASH env is missing", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { consumeCheckoutAttempt } = await import("@/lib/ratelimit");
    const result = await consumeCheckoutAttempt("profile:abc");
    expect(result.ok).toBe(true);
  });
});

describe("ratelimit — Upstash error fail-open", () => {
  it("returns ok=true when the Upstash call throws (login)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

    // Mock @upstash/ratelimit to throw on .limit()
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow() {
          return null;
        }
        async limit() {
          throw new Error("upstash down");
        }
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: class {
        constructor() {}
      },
    }));

    const { consumeLoginAttempt } = await import("@/lib/ratelimit");
    const result = await consumeLoginAttempt("user@example.com");
    expect(result.ok).toBe(true);
  });
});

describe("ratelimit — normalises email key", () => {
  it("rejects mixed-case email separately from lowercase (one user, one key)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

    // Spy: track the key the limiter sees.
    const calls: string[] = [];
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow() {
          return null;
        }
        async limit(key: string) {
          calls.push(key);
          return { success: true, remaining: 4, reset: Date.now() + 60000 };
        }
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: class {
        constructor() {}
      },
    }));

    const { consumeLoginAttempt } = await import("@/lib/ratelimit");
    await consumeLoginAttempt("  User@Example.COM ");
    await consumeLoginAttempt("user@example.com");

    expect(calls).toEqual(["user@example.com", "user@example.com"]);
  });
});
