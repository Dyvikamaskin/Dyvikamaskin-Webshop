/**
 * Audit logging helper — Phase 10
 *
 * Writes a single AuditLog row. Failures are swallowed so they never
 * crash the main operation.
 *
 * Actor must be a valid Profile ID. Use the SUPER_ADMIN fallback only in
 * system-triggered contexts (e.g. Vipps webhook) where no session exists.
 */

import { prisma } from "./prisma";

export async function logAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  previousValue?: unknown,
  newValue?: unknown
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        previousValue:
          previousValue !== undefined ? (previousValue as object) : undefined,
        newValue: newValue !== undefined ? (newValue as object) : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] write failed", action, targetId, err);
  }
}
