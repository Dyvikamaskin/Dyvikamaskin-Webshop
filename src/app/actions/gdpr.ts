"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { UserRole } from "@/app/generated/prisma/enums";

// ─── Art. 20 — data portability (JSON export) ────────────────────────────────

/**
 * Build a JSON document containing every row across the public schema
 * that references the given profile. Returned in a portable shape
 * suitable for handing to the customer (GDPR §20).
 *
 * Auth: STORE_MANAGER+ only. Customer-initiated exports must go through
 * the admin so we have a paper trail in AuditLog.
 */
export async function exportCustomerDataAction(
  profileId: string,
): Promise<string> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const [
    profile,
    sales,
    quotes,
    savedMachines,
    customerPriceList,
    notifications,
    returnRequests,
  ] = await Promise.all([
    prisma.profile.findUnique({ where: { id: profileId } }),
    prisma.sale.findMany({
      where: { customerId: profileId },
      include: { items: true },
    }),
    prisma.quote.findMany({
      where: { customerId: profileId },
      include: { items: true },
    }),
    prisma.savedMachine.findMany({ where: { profileId } }),
    prisma.customerPriceList.findMany({ where: { profileId } }),
    prisma.notification.findMany({ where: { profileId } }),
    prisma.returnRequest.findMany({
      where: { customerId: profileId },
      include: { items: true },
    }),
  ]);

  if (!profile) throw new Error("Profile not found");

  const payload = {
    exportGeneratedAt: new Date().toISOString(),
    exportGeneratedBy: admin.id,
    legalBasis: "GDPR Art. 20 (right to data portability)",
    profile,
    sales,
    quotes,
    savedMachines,
    customerPriceList,
    notifications,
    returnRequests,
  };

  await logAudit(admin.id, "GDPR_DATA_EXPORTED", "Profile", profileId, null, {
    counts: {
      sales: sales.length,
      quotes: quotes.length,
      savedMachines: savedMachines.length,
      customerPriceList: customerPriceList.length,
      returnRequests: returnRequests.length,
      notifications: notifications.length,
    },
  });

  return JSON.stringify(payload, null, 2);
}

// ─── Art. 17 — right to erasure (anonymise) ──────────────────────────────────

const ANON = "ANONYMISERT";

/**
 * Anonymise a customer profile.
 *
 * What we erase: PII on Profile (fullName, email, phoneNumber, address,
 * postal info, companyName, orgNumber, invoiceEmail).
 *
 * What we preserve: Sale rows and SaleItem snapshots, Quote rows,
 * AuditLog entries, financial totals. Bokføringsloven §13 requires 5
 * years of retention; we satisfy it by retaining the records but
 * stripping their identifying personal data.
 *
 * After anonymisation: customer's authentication is disabled (the
 * Supabase Auth side requires a separate auth.admin.deleteUser call —
 * that's intentionally NOT done here so this action is reversible from
 * an "I made a mistake" perspective. The admin has to perform the
 * auth-side deletion as a separate step.)
 */
export async function anonymiseCustomerAction(
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const before = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      email: true,
      fullName: true,
      phoneNumber: true,
      address: true,
      postalCode: true,
      city: true,
      companyName: true,
      orgNumber: true,
      invoiceEmail: true,
    },
  });
  if (!before) return { ok: false, error: "Profile not found" };

  // We keep email syntactically valid (some queries assume unique
  // email + non-null) by suffixing with the profile id.
  const anonEmail = `anon+${profileId.slice(0, 8)}@dyvikamaskin.invalid`;

  await prisma.profile.update({
    where: { id: profileId },
    data: {
      email: anonEmail,
      fullName: ANON,
      phoneNumber: null,
      address: null,
      postalCode: null,
      city: null,
      companyName: null,
      orgNumber: null,
      invoiceEmail: null,
      isActive: false,
      marketingConsentAt: null,
      backupPublicKey: null,
    },
  });

  await logAudit(
    admin.id,
    "GDPR_PROFILE_ANONYMISED",
    "Profile",
    profileId,
    before,
    { anonEmail, retainedSalesForBokforingsloven: true },
  );

  revalidatePath(`/admin/kunder/${profileId}`);
  return { ok: true };
}
