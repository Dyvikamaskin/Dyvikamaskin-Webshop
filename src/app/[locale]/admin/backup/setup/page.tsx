import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { BackupSetupForm } from "@/components/admin/BackupSetupForm";
import { TriggerBackupButton } from "@/components/admin/TriggerBackupButton";

export const metadata: Metadata = {
  title: "Sikkerhetskopi — oppsett",
};

/**
 * /admin/backup/setup — Phase 4.5
 *
 * SUPER_ADMIN-only page for first-time backup keypair generation. The
 * actual age keypair is generated in the browser (BackupSetupForm is
 * "use client") so the private key never crosses the wire. The public
 * key is saved on Profile via a server action.
 *
 * If a key already exists, the page still renders — it lets the admin
 * rotate the key. The old key is overwritten only after the new one is
 * saved.
 */
export default async function BackupSetupPage() {
  let admin;
  try {
    admin = await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    redirect("/login?next=/admin/backup/setup");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: admin.id },
    select: { backupPublicKey: true, lastBackupAt: true },
  });

  return (
    <main style={{ maxWidth: "720px", padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Sikkerhetskopi — oppsett av nøkkel
      </h1>
      <p style={{ color: "#475569", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Generer et age-nøkkelpar direkte i nettleseren. Den private
        nøkkelen lastes ned som en tekstfil og forlater aldri din enhet.
        Den offentlige nøkkelen lagres på din profil og brukes til å
        kryptere fremtidige sikkerhetskopier — bare den private nøkkelen
        kan dekryptere dem.
      </p>

      <div
        style={{
          background: "#fff7ed",
          border: "1px solid #fdba74",
          borderRadius: "0.5rem",
          padding: "1rem",
          marginBottom: "1.5rem",
          fontSize: "0.9375rem",
          color: "#9a3412",
        }}
      >
        <strong>Viktig:</strong> Hvis du mister den private nøkkelen, kan
        ingen tidligere sikkerhetskopier dekrypteres. Lagre den et trygt
        sted utenfor nett (USB-pinne i safe, passordhåndterer, etc.).
      </div>

      {profile?.backupPublicKey ? (
        <p
          style={{
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.875rem",
            color: "#166534",
          }}
        >
          ✓ Nøkkel registrert (
          <code style={{ fontFamily: "monospace" }}>
            {profile.backupPublicKey.slice(0, 16)}…
          </code>
          ). Generer ny under for å rotere.
        </p>
      ) : null}

      <BackupSetupForm hasExistingKey={Boolean(profile?.backupPublicKey)} />

      <TriggerBackupButton hasKey={Boolean(profile?.backupPublicKey)} />
    </main>
  );
}
