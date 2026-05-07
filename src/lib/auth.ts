import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/client";

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
