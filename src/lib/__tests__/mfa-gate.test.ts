import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the MFA enforcement gate inside requireRole.
 *
 * We mock the Prisma profile lookup + the Supabase client so we can
 * drive `requireRole(STORE_MANAGER)` through every gate path:
 *   - enforcement OFF: pass through, no MFA check
 *   - enforcement ON, aal:'aal2': pass through
 *   - enforcement ON, aal:'aal1': redirect to /konto/mfa/setup
 *   - enforcement ON, FULFILLMENT_STAFF role (below STORE_MANAGER): pass
 *     through even without aal:'aal2' (not in MFA_REQUIRED_FOR)
 */

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  findUnique: vi.fn(),
  create: vi.fn(),
  getUser: vi.fn(),
  getAal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAal,
      },
    },
  }),
}));

const ORIGINAL_FLAG = process.env.MFA_ENFORCEMENT_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b" } } });
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.MFA_ENFORCEMENT_ENABLED;
  else process.env.MFA_ENFORCEMENT_ENABLED = ORIGINAL_FLAG;
});

async function callRequireRole(minimum: "FULFILLMENT_STAFF" | "STORE_MANAGER" | "SUPER_ADMIN") {
  const { requireRole } = await import("@/lib/auth");
  const { UserRole } = await import("@/app/generated/prisma/client");
  return requireRole(UserRole[minimum]);
}

describe("requireRole — MFA gate when MFA_ENFORCEMENT_ENABLED is not 'true'", () => {
  beforeEach(() => {
    delete process.env.MFA_ENFORCEMENT_ENABLED;
  });

  it("passes through STORE_MANAGER without checking AAL", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      role: "STORE_MANAGER",
      isActive: true,
    });

    const result = await callRequireRole("STORE_MANAGER");
    expect(result.role).toBe("STORE_MANAGER");
    expect(mocks.getAal).not.toHaveBeenCalled();
  });
});

describe("requireRole — MFA gate when MFA_ENFORCEMENT_ENABLED='true'", () => {
  beforeEach(() => {
    process.env.MFA_ENFORCEMENT_ENABLED = "true";
  });

  it("passes through STORE_MANAGER with aal:'aal2'", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      role: "STORE_MANAGER",
      isActive: true,
    });
    mocks.getAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const result = await callRequireRole("STORE_MANAGER");
    expect(result.role).toBe("STORE_MANAGER");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects STORE_MANAGER without aal:'aal2' to /konto/mfa/setup", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      role: "STORE_MANAGER",
      isActive: true,
    });
    mocks.getAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await expect(callRequireRole("STORE_MANAGER")).rejects.toThrow(
      "REDIRECT:/konto/mfa/setup",
    );
  });

  it("fail-closes (redirects) when getAuthenticatorAssuranceLevel errors", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      role: "SUPER_ADMIN",
      isActive: true,
    });
    mocks.getAal.mockResolvedValue({
      data: null,
      error: { message: "supabase down" },
    });

    await expect(callRequireRole("SUPER_ADMIN")).rejects.toThrow(
      "REDIRECT:/konto/mfa/setup",
    );
  });

  it("does NOT MFA-check FULFILLMENT_STAFF (below STORE_MANAGER threshold)", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      role: "FULFILLMENT_STAFF",
      isActive: true,
    });

    const result = await callRequireRole("FULFILLMENT_STAFF");
    expect(result.role).toBe("FULFILLMENT_STAFF");
    expect(mocks.getAal).not.toHaveBeenCalled();
  });
});
