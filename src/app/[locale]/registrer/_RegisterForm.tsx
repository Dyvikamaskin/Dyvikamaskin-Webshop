"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Norwegian error messages ─────────────────────────────────────────────────

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Det finnes allerede en konto med denne e-postadressen.";
  if (m.includes("password should be at least"))
    return "Passordet må være minst 6 tegn.";
  if (m.includes("unable to validate email"))
    return "Ugyldig e-postadresse.";
  if (m.includes("too many requests"))
    return "For mange forsøk. Vent litt og prøv igjen.";
  return "Registrering feilet. Prøv igjen.";
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.3rem",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterForm() {
  const [fullName,  setFullName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [password2, setPassword2] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [done,      setDone]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Navn er påkrevd."); return; }
    if (password.length < 6) { setError("Passordet må være minst 6 tegn."); return; }
    if (password !== password2) { setError("Passordene stemmer ikke overens."); return; }

    setLoading(true);

    const supabase = createClient();
    const { error: sbError } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        // After email confirmation, the auth callback handles the session
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/`,
      },
    });

    setLoading(false);

    if (sbError) {
      setError(translateError(sbError.message));
      return;
    }

    setDone(true);
  }

  // ── Success state ────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📧</div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem" }}>
          Sjekk e-posten din
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1.25rem" }}>
          Vi har sendt en bekreftelseslenke til <strong>{email}</strong>.
          Klikk på lenken for å aktivere kontoen din.
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
          Gå til innlogging
        </a>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────
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

      {/* Full name */}
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="fullName" style={labelStyle}>Fullt navn</label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={loading}
          style={inputStyle}
          placeholder="Ola Nordmann"
        />
      </div>

      {/* Email */}
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="email" style={labelStyle}>E-post</label>
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

      {/* Password */}
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="password" style={labelStyle}>Passord</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          style={inputStyle}
          placeholder="Minst 6 tegn"
        />
      </div>

      {/* Confirm password */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="password2" style={labelStyle}>Bekreft passord</label>
        <input
          id="password2"
          type="password"
          autoComplete="new-password"
          required
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          disabled={loading}
          style={inputStyle}
          placeholder="Gjenta passordet"
        />
      </div>

      {/* Submit */}
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
        {loading ? "Registrerer…" : "Opprett konto"}
      </button>

      {/* Login link */}
      <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.85rem", color: "#64748b" }}>
        Har du allerede konto?{" "}
        <a href="/login" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          Logg inn
        </a>
      </p>
    </form>
  );
}
