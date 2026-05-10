import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";

const STALE_DAYS = 7;

/**
 * /admin dashboard widget — Phase 4.5
 *
 * Server component. SUPER_ADMIN-only; renders nothing for other roles.
 * Two states:
 *   1. No backupPublicKey → "Sett opp" link to /admin/backup/setup
 *   2. Key configured → download link + "last backup X days ago"
 *
 * The download link points at /api/admin/backup/download which streams
 * an age-encrypted SQL dump.
 */
export async function BackupWidget() {
  let admin;
  try {
    admin = await requireRole(UserRole.STORE_MANAGER);
  } catch {
    return null;
  }
  if (admin.role !== UserRole.SUPER_ADMIN) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: admin.id },
    select: { backupPublicKey: true, lastBackupAt: true },
  });

  const hasKey = Boolean(profile?.backupPublicKey);
  const lastBackup = profile?.lastBackupAt;
  const daysSince = lastBackup
    ? Math.floor(
        (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;
  const stale = daysSince !== null && daysSince >= STALE_DAYS;

  const containerStyle: React.CSSProperties = {
    background: stale ? "#fef9c3" : "#f8fafc",
    border: `1px solid ${stale ? "#facc15" : "#e2e8f0"}`,
    borderRadius: "0.5rem",
    padding: "1rem 1.25rem",
    marginBottom: "1.5rem",
  };

  if (!hasKey) {
    return (
      <div style={containerStyle}>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700 }}>
          🔐 Sikkerhetskopi
        </h3>
        <p style={{ margin: "0 0 0.5rem", color: "#475569", fontSize: "0.9375rem" }}>
          Ingen krypteringsnøkkel registrert. Sett opp før første sikkerhetskopi.
        </p>
        <Link
          href="/admin/backup/setup"
          style={{
            display: "inline-block",
            padding: "0.4rem 0.9rem",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "0.375rem",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Sett opp nøkkel
        </Link>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700 }}>
        🔐 Sikkerhetskopi
      </h3>
      <p style={{ margin: "0 0 0.75rem", color: "#475569", fontSize: "0.9375rem" }}>
        {lastBackup
          ? `Sist lastet ned for ${daysSince} dag${daysSince === 1 ? "" : "er"} siden${
              stale ? " — vurder å laste ned en ny." : "."
            }`
          : "Ingen sikkerhetskopi er lastet ned ennå."}
      </p>
      <a
        href="/api/admin/backup/download"
        style={{
          display: "inline-block",
          padding: "0.4rem 0.9rem",
          background: "#0f172a",
          color: "#fff",
          borderRadius: "0.375rem",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "0.875rem",
          marginRight: "0.5rem",
        }}
      >
        Last ned sikkerhetskopi
      </a>
      <Link
        href="/admin/backup/setup"
        style={{
          display: "inline-block",
          padding: "0.4rem 0.9rem",
          background: "transparent",
          color: "#475569",
          border: "1px solid #cbd5e1",
          borderRadius: "0.375rem",
          textDecoration: "none",
          fontWeight: 500,
          fontSize: "0.875rem",
        }}
      >
        Roter nøkkel
      </Link>
    </div>
  );
}
