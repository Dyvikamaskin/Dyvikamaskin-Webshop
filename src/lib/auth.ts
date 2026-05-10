import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/client";

// ─── Phase 6 — MFA enforcement gate ────────────────────────────────────────
// Two-phase rollout per the handoff:
//   * MFA_ENFORCEMENT_ENABLED unset / "false" / "0" → code path active but
//     no enforcement. Admins can enroll TOTP at /konto/mfa/setup whenever.
//   * MFA_ENFORCEMENT_ENABLED = "true" → STORE_MANAGER+ requireRole() calls
//     reject sessions without aal:'aal2' and redirect to /konto/mfa/setup.
// The check is at request time, so flipping the env var on Railway takes
// effect on the next request without redeploy.
function mfaEnforcementEnabled(): boolean {
  return process.env.MFA_ENFORCEMENT_ENABLED === "true";
}

// Roles that must use MFA when enforcement is enabled. Customers and
// FULFILLMENT_STAFF stay on password-only — MFA is for STORE_MANAGER+
// who can modify pricing, inventory, and order state.
const MFA_REQUIRED_FOR: ReadonlySet<UserRole> = new Set([
  UserRole.STORE_MANAGER,
  UserRole.SUPER_ADMIN,
]);

// ─── Role hierarchy ───────────────────────────────────────────────────────────
// null (customer) < FULFILLMENT_STAFF < STORE_MANAGER < SUPER_ADMIN
const ROLE_RANK: Record<UserRole, number> = {
  FULFILLMENT_STAFF: 1,
  STORE_MANAGER: 2,
  SUPER_ADMIN: 3,
};

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Returns the Supabase auth user, or null if not signed in.
 * Always uses getUser() — never getSession() — to prevent token spoofing.
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the auth user or redirects to /login.
 */
export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Returns the Profile record for the current auth user.
 * Creates a minimal CUSTOMER profile automatically on first sign-in.
 */
export async function getProfile() {
  const user = await requireAuth();

  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile) {
    // Auto-provision profile on first sign-in
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        email: user.email!,
        fullName: user.user_metadata?.full_name ?? "",
      },
    });
  }

  return profile;
}

// ─── Role enforcement ─────────────────────────────────────────────────────────

/**
 * Asserts the current user holds at least `minimumRole`.
 * Customers (role = null) never pass staff checks.
 * Redirects to /unauthorized if the check fails.
 *
 * @returns the Profile if authorized
 */
export async function requireRole(minimumRole: UserRole) {
  const profile = await getProfile();

  if (
    !profile.role ||
    (ROLE_RANK[profile.role] ?? 0) < ROLE_RANK[minimumRole]
  ) {
    redirect("/unauthorized");
  }

  // Phase 6 — MFA gate. Skipped when MFA_ENFORCEMENT_ENABLED is not "true";
  // skipped when the requested role is below STORE_MANAGER (e.g. FULFILLMENT_STAFF
  // pickup-station accounts that don't need TOTP).
  if (mfaEnforcementEnabled() && MFA_REQUIRED_FOR.has(minimumRole)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    // On error (Supabase outage), fail-closed for admin routes: better
    // to lock out admins for a few seconds than to let a downgraded
    // session through. Customer/staff routes are unaffected.
    if (error || data?.currentLevel !== "aal2") {
      redirect("/konto/mfa/setup");
    }
  }

  return profile;
}

// ─── Store-level access ───────────────────────────────────────────────────────

/**
 * Asserts the current staff member has access to `storeId`.
 * SUPER_ADMIN bypasses the StoreStaff table and may access any store.
 * Others must have a StoreStaff record for the given store.
 * Redirects to /unauthorized if the check fails.
 *
 * @returns { profile, storeStaff | null, store }
 */
export async function requireStoreAccess(storeId: string) {
  const profile = await requireRole(UserRole.FULFILLMENT_STAFF);

  if (profile.role === UserRole.SUPER_ADMIN) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) redirect("/unauthorized");
    return { profile, storeStaff: null, store };
  }

  const storeStaff = await prisma.storeStaff.findUnique({
    where: { profileId_storeId: { profileId: profile.id, storeId } },
    include: { store: true },
  });

  if (!storeStaff) redirect("/unauthorized");

  return { profile, storeStaff, store: storeStaff.store };
}
