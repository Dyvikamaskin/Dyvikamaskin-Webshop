import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique } },
}));

import { canSendEmail } from "@/lib/email-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canSendEmail — Phase 9 marketing consent gate", () => {
  it("TRANSACTIONAL always passes (no DB lookup)", async () => {
    const ok = await canSendEmail("anyone@example.com", "TRANSACTIONAL");
    expect(ok).toBe(true);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("MARKETING is blocked when marketingConsentAt is null", async () => {
    mocks.findUnique.mockResolvedValue({ marketingConsentAt: null });
    const ok = await canSendEmail("nope@example.com", "MARKETING");
    expect(ok).toBe(false);
  });

  it("MARKETING is allowed when marketingConsentAt is set", async () => {
    mocks.findUnique.mockResolvedValue({ marketingConsentAt: new Date() });
    const ok = await canSendEmail("yes@example.com", "MARKETING");
    expect(ok).toBe(true);
  });

  it("MARKETING passes when no Profile exists for the email", async () => {
    // No row means there's no consent gate to enforce — these are usually
    // ad-hoc admin alerts, not customer marketing.
    mocks.findUnique.mockResolvedValue(null);
    const ok = await canSendEmail("admin@example.com", "MARKETING");
    expect(ok).toBe(true);
  });

  it("MARKETING fails closed on DB error", async () => {
    mocks.findUnique.mockRejectedValue(new Error("connection refused"));
    const ok = await canSendEmail("foo@example.com", "MARKETING");
    expect(ok).toBe(false);
  });

  it("normalises email to lowercase + trim before lookup", async () => {
    mocks.findUnique.mockResolvedValue({ marketingConsentAt: new Date() });
    await canSendEmail("  Foo@Example.COM  ", "MARKETING");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { email: "foo@example.com" },
      select: { marketingConsentAt: true },
    });
  });
});
