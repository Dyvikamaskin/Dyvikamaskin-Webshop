/**
 * GET /api/admin/backup/download — Phase 4.5
 *
 * Streams an age-encrypted Postgres dump to a SUPER_ADMIN. The admin's
 * `Profile.backupPublicKey` (set during /admin/backup/setup) is the
 * recipient. Decryption requires the matching private key, which the
 * admin downloaded once at setup and stores offline.
 *
 * Logs an `BACKUP_DOWNLOADED` audit entry per call and bumps
 * `Profile.lastBackupAt` so the admin dashboard can show the staleness
 * of the last backup.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildDumpStream } from "@/lib/backup/dump";
import { encryptStream } from "@/lib/backup/age";
import { UserRole } from "@/app/generated/prisma/enums";

export async function GET(_request: NextRequest) {
  let admin: Awaited<ReturnType<typeof requireRole>>;
  try {
    admin = await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: admin.id },
    select: { backupPublicKey: true },
  });
  if (!profile?.backupPublicKey) {
    return NextResponse.json(
      {
        error:
          "Backup keypair not configured. Visit /admin/backup/setup first.",
      },
      { status: 400 },
    );
  }

  const cleartext = buildDumpStream();
  const encrypted = await encryptStream(cleartext, profile.backupPublicKey);

  const filename = `industriparts-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.sql.age`;

  // Fire-and-forget audit log + lastBackupAt bump. Don't block the
  // download stream on these — they're best-effort observability.
  void Promise.all([
    logAudit(admin.id, "BACKUP_DOWNLOADED", "Profile", admin.id, null, {
      filename,
      generatedAt: new Date().toISOString(),
    }),
    prisma.profile.update({
      where: { id: admin.id },
      data: { lastBackupAt: new Date() },
    }),
  ]).catch((err) => {
    console.error("[backup] audit/lastBackupAt update failed", err);
  });

  return new NextResponse(encrypted as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
