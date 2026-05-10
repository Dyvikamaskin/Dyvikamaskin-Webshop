import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { MfaSetupForm } from "@/components/admin/MfaSetupForm";

export const metadata: Metadata = {
  title: "To-faktor-autentisering — oppsett",
};

/**
 * /konto/mfa/setup — Phase 6
 *
 * Authenticated-only page for enrolling a TOTP factor on a Supabase Auth
 * account. The actual enroll/verify dance happens in the client component
 * (MfaSetupForm) because the Supabase JS SDK manages the in-flight
 * factor + challenge IDs in memory across two API calls.
 *
 * This page is the redirect target when `requireRole(STORE_MANAGER+)`
 * sees a session without aal:'aal2' AND MFA_ENFORCEMENT_ENABLED=true.
 * It is also discoverable by any authenticated user who wants to enroll
 * proactively before enforcement turns on.
 */
export default async function MfaSetupPage() {
  await requireAuth();

  return (
    <main style={{ maxWidth: "640px", padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        To-faktor-autentisering
      </h1>
      <p style={{ color: "#475569", marginBottom: "1.25rem", lineHeight: 1.5 }}>
        Skann QR-koden under med en TOTP-app (Authy, Google Authenticator,
        1Password, etc.) og skriv inn den 6-sifrede koden for å aktivere
        to-faktor-autentisering på kontoen din.
      </p>

      <div
        style={{
          background: "#fff7ed",
          border: "1px solid #fdba74",
          borderRadius: "0.5rem",
          padding: "0.875rem 1rem",
          marginBottom: "1.5rem",
          fontSize: "0.9rem",
          color: "#9a3412",
        }}
      >
        Lagre en backup-kode eller hold appen din trygt. Mister du tilgang
        til TOTP-appen, må en SUPER_ADMIN tilbakestille kontoen din i
        Supabase-konsollen.
      </div>

      <MfaSetupForm />
    </main>
  );
}
