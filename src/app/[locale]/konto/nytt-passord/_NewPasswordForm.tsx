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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.3rem",
};

export default function NewPasswordForm() {
  const [password,  setPassword]  = useState("");
  const [password2, setPassword2] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) { setError("Passordet må være minst 6 tegn."); return; }
    if (password !== password2) { setError("Passordene stemmer ikke overens."); return; }

    setLoading(true);

    const supabase = createClient();
    const { error: sbError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (sbError) {
      setError("Kunne ikke oppdatere passordet. Lenken kan ha utløpt — be om en ny.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem" }}>
          Passord oppdatert
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1.25rem" }}>
          Du kan nå logge inn med det nye passordet ditt.
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

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="password" style={labelStyle}>Nytt passord</label>
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

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="password2" style={labelStyle}>Bekreft nytt passord</label>
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
        {loading ? "Lagrer…" : "Lagre nytt passord"}
      </button>
    </form>
  );
}
