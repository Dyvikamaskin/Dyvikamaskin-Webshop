"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Phase =
  | "loading"      // Checking current MFA state
  | "already"      // User already has aal2 — show success state
  | "enrolling"    // QR / secret ready, awaiting code entry
  | "verifying"    // POSTing code to /mfa/verify
  | "verified"     // Success, redirect imminent
  | "error";

interface EnrollData {
  factorId: string;
  qrCode: string;        // SVG data URL
  secret: string;        // base32 secret for manual entry
}

/**
 * MFA enrollment + verification UI (Phase 6).
 *
 * Flow per Supabase docs:
 *   1. supabase.auth.mfa.enroll({ factorType: 'totp' }) → factorId + totp.qr_code + totp.secret
 *   2. User scans QR (or types secret) in their TOTP app
 *   3. supabase.auth.mfa.challenge({ factorId }) → challengeId
 *   4. supabase.auth.mfa.verify({ factorId, challengeId, code }) → upgrades session to aal2
 *
 * If a previous unverified factor exists (e.g. user bailed mid-enroll),
 * the list endpoint reveals it and we unenroll before starting fresh so
 * we don't accumulate orphaned factor IDs.
 */
export function MfaSetupForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    void start();
     
  }, []);

  async function start() {
    const supabase = createClient();
    setError("");

    // Check whether the session is already at AAL2 (re-visiting the page
    // after enrollment, or a previous session that still has the factor).
    const { data: aal, error: aalErr } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) {
      setError(`Kunne ikke hente MFA-status: ${aalErr.message}`);
      setPhase("error");
      return;
    }
    if (aal?.currentLevel === "aal2") {
      setPhase("already");
      return;
    }

    // Clean up any half-enrolled factors before starting a fresh one.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.totp ?? []) {
      if (f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `TOTP ${new Date().toISOString().slice(0, 10)}`,
    });
    if (enrollErr || !data) {
      setError(`Kunne ikke starte enrollment: ${enrollErr?.message ?? "ukjent feil"}`);
      setPhase("error");
      return;
    }
    setEnroll({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setPhase("enrolling");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setPhase("verifying");
    setError("");

    const supabase = createClient();
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (chErr || !challenge) {
      setError(`Kunne ikke starte verifisering: ${chErr?.message ?? "ukjent feil"}`);
      setPhase("error");
      return;
    }
    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verErr) {
      setError(`Koden ble avvist: ${verErr.message}`);
      setPhase("enrolling");
      return;
    }
    setPhase("verified");
    // Reload so the new aal:'aal2' session cookie is picked up by the
    // server on the next navigation.
    setTimeout(() => {
      window.location.href = "/admin";
    }, 1500);
  }

  if (phase === "loading") {
    return <p style={{ color: "#475569" }}>Laster MFA-status…</p>;
  }

  if (phase === "already") {
    return (
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "0.5rem",
          padding: "0.875rem 1rem",
          color: "#166534",
        }}
      >
        ✓ Din sesjon er allerede sikret med to-faktor-autentisering.
      </div>
    );
  }

  return (
    <div>
      {enroll ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <div
            dangerouslySetInnerHTML={{ __html: enroll.qrCode }}
            style={{
              width: "200px",
              height: "200px",
              background: "#fff",
              padding: "0.5rem",
              border: "1px solid #e2e8f0",
              borderRadius: "0.5rem",
              marginBottom: "0.75rem",
            }}
          />
          <details>
            <summary style={{ fontSize: "0.85rem", color: "#64748b", cursor: "pointer" }}>
              Kan ikke skanne QR-koden? Skriv inn hemmelig nøkkel manuelt.
            </summary>
            <code
              style={{
                display: "block",
                marginTop: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "#f8fafc",
                borderRadius: "0.375rem",
                fontFamily: "monospace",
                fontSize: "0.8125rem",
                wordBreak: "break-all",
              }}
            >
              {enroll.secret}
            </code>
          </details>
        </div>
      ) : null}

      <form onSubmit={handleVerify}>
        <label
          style={{
            display: "block",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "#374151",
            marginBottom: "0.4rem",
          }}
        >
          6-sifret kode fra TOTP-appen
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={phase === "verifying" || phase === "verified"}
          style={{
            padding: "0.55rem 0.75rem",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            fontSize: "1rem",
            fontFamily: "monospace",
            letterSpacing: "0.25rem",
            width: "150px",
            marginBottom: "0.875rem",
          }}
          placeholder="000000"
        />

        <div>
          <button
            type="submit"
            disabled={phase === "verifying" || phase === "verified" || code.length !== 6}
            style={{
              padding: "0.55rem 1.1rem",
              background: phase === "verified" ? "#16a34a" : "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: code.length === 6 ? "pointer" : "not-allowed",
            }}
          >
            {phase === "verifying"
              ? "Verifiserer…"
              : phase === "verified"
                ? "✓ Aktivert — videresender …"
                : "Aktiver to-faktor"}
          </button>
        </div>
      </form>

      {error ? (
        <p
          style={{
            marginTop: "1rem",
            color: "#dc2626",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
