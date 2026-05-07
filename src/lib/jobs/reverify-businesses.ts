import { prisma } from "@/lib/prisma";
import { lookupOrgNumber, isCompanyActive } from "@/lib/brreg";

export interface ReverifyResult {
  total: number;
  verified: number;
  flagged: string[]; // profileIds that failed verification
  errors: number;
}

/**
 * Weekly re-verification job.
 *
 * Checks all active B2B profiles with isApprovedForInvoice = true against Brreg.
 * Does NOT automatically block accounts — only flags them for SUPER_ADMIN review.
 *
 * Called from /api/jobs/reverify-businesses (protected by CRON_SECRET).
 */
export async function reverifyBusinesses(): Promise<ReverifyResult> {
  const profiles = await prisma.profile.findMany({
    where: {
      customerType: "BUSINESS",
      isApprovedForInvoice: true,
      isActive: true,
      orgNumber: { not: null },
    },
    select: { id: true, orgNumber: true, email: true, companyName: true },
  });

  const result: ReverifyResult = {
    total: profiles.length,
    verified: 0,
    flagged: [],
    errors: 0,
  };

  for (const profile of profiles) {
    try {
      const enhet = await lookupOrgNumber(profile.orgNumber!);

      if (!enhet || !isCompanyActive(enhet)) {
        result.flagged.push(profile.id);

        // Log the flag — use the profile's own id as "actor" since this is
        // a system check acting on behalf of the account.
        // Phase 14 will surface these in the admin audit log viewer.
        await prisma.auditLog.create({
          data: {
            actorId: profile.id,
            action: "BUSINESS_REVERIFICATION_FAILED",
            targetType: "Profile",
            targetId: profile.id,
            newValue: {
              orgNumber: profile.orgNumber,
              reason: !enhet
                ? "not_found_in_brreg"
                : "company_inactive",
              flaggedAt: new Date().toISOString(),
            },
          },
        });
      } else {
        result.verified++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}
