"use client";

import { useState } from "react";
import { loginAction } from "@/app/actions/auth";

// ─── Shared input style ───────────────────────────────────────────────────────

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

export default function LoginForm({ next }: { next?: string }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Server action handles rate-limit + signInWithPassword + cookie set.
    const result = await loginAction(email, password);

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Hard-navigate so the server session cookie is picked up
    window.location.href = next ?? "/";
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Error banner */}
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
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="password" style={labelStyle}>Passord</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          style={inputStyle}
          placeholder="••••••••"
        />
      </div>

      {/* Forgot password */}
      <div style={{ textAlign: "right", marginBottom: "1.25rem" }}>
        <a
          href="/glemt-passord"
          style={{ fontSize: "0.8rem", color: "#2563eb", textDecoration: "none" }}
        >
          Glemt passord?
        </a>
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
          transition: "background 0.15s",
        }}
      >
        {loading ? "Logger inn…" : "Logg inn"}
      </button>

      {/* Register link */}
      <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.85rem", color: "#64748b" }}>
        Har du ikke konto?{" "}
        <a href="/registrer" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          Registrer deg
        </a>
      </p>
    </form>
  );
}
