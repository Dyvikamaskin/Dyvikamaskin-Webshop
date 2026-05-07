"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.9rem",
  color: "#0f172a",
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
};

export default function ForgotPasswordForm() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: sbError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/konto/nytt-passord`,
      }
    );

    setLoading(false);

    if (sbError) {
      setError("Noe gikk galt. Sjekk e-postadressen og prøv igjen.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📧</div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem" }}>
          Sjekk e-posten din
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1.25rem" }}>
          Hvis det finnes en konto for <strong>{email}</strong>, har vi sendt en lenke
          for å tilbakestille passordet.
        </p>
        <a
          href="/login"
          style={{
            display: "inline-block",
            padding: "0.55rem 1.25rem",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            fontSize: "0.875rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Tilbake til innlogging
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div
          style={{
            padding: "0.65rem 0.9rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "6px",
            color: "#dc2626",
            fontSize: "0.85rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1.25rem" }}>
        Skriv inn e-postadressen din, så sender vi deg en lenke for å tilbakestille passordet.
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <label
          htmlFor="email"
          style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}
        >
          E-post
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          style={inputStyle}
          placeholder="deg@eksempel.no"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "0.65rem",
          background: loading ? "#94a3b8" : "#0f172a",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "0.9rem",
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Sender…" : "Send tilbakestillingslenke"}
      </button>

      <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.85rem", color: "#64748b" }}>
        <a href="/login" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          ← Tilbake til innlogging
        </a>
      </p>
    </form>
  );
}
