"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookieConsentValue, Cookies } from "react-cookie-consent";

/**
 * Granular cookie-consent banner — Phase 9 follow-up.
 *
 * Three categories:
 *   * Essential — always on; cannot be opted out (Supabase session,
 *     cart Zustand persist, locale, consent state itself).
 *   * Analytics — off by default. Triggers any future analytics
 *     integrations (Plausible, PostHog, etc.) at runtime via the
 *     `dyvikamaskin-cookie-analytics` cookie.
 *   * Marketing — off by default. Required before any third-party
 *     marketing pixel or remarketing tag fires.
 *
 * Cookie names:
 *   dyvikamaskin-cookie-consent       — top-level "accepted vs declined"
 *   dyvikamaskin-cookie-analytics     — "true" | "false"
 *   dyvikamaskin-cookie-marketing     — "true" | "false"
 *   dyvikamaskin-cookie-consent-date  — ISO date of the most recent save
 *
 * Re-prompt: tied to the top-level consent cookie's 365-day expiry.
 * Users can re-open the panel via a future "Cookie-innstillinger" link
 * by setting `dyvikamaskin-cookie-consent` to "reopen" before navigation.
 */

const TOP_LEVEL = "dyvikamaskin-cookie-consent";
const ANALYTICS = "dyvikamaskin-cookie-analytics";
const MARKETING = "dyvikamaskin-cookie-marketing";
const SAVED_AT  = "dyvikamaskin-cookie-consent-date";

export function CookieConsentBanner() {
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const current = getCookieConsentValue(TOP_LEVEL);
    const shouldOpen = current === undefined || current === "reopen";
    if (shouldOpen) setOpen(true);
    setAnalytics(Cookies.get(ANALYTICS) === "true");
    setMarketing(Cookies.get(MARKETING) === "true");
  }, []);

  function save(values: { analytics: boolean; marketing: boolean }) {
    const opts = { expires: 365, path: "/" };
    Cookies.set(TOP_LEVEL, "true", opts);
    Cookies.set(ANALYTICS, String(values.analytics), opts);
    Cookies.set(MARKETING, String(values.marketing), opts);
    Cookies.set(SAVED_AT, new Date().toISOString(), opts);
    setOpen(false);
  }

  function acceptAll() {
    save({ analytics: true, marketing: true });
  }
  function rejectAll() {
    save({ analytics: false, marketing: false });
  }
  function saveCustom() {
    save({ analytics, marketing });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#0f172a",
        color: "#f8fafc",
        padding: "1.25rem 1.5rem",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.25)",
        fontSize: "0.875rem",
        lineHeight: 1.5,
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h2
          id="cookie-consent-title"
          style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", fontWeight: 700 }}
        >
          Vi bruker informasjonskapsler
        </h2>
        <p id="cookie-consent-body" style={{ margin: "0 0 1rem", color: "#cbd5e1" }}>
          Nødvendige kapsler kreves for at handlekurv, innlogging og språk
          skal fungere. Du kan velge om vi får sette analyse- og
          markedsføringskapsler. Mer informasjon på{" "}
          <Link href="/personvern" style={{ color: "#93c5fd", textDecoration: "underline" }}>
            personvern-siden
          </Link>
          .
        </p>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem" }}>
          <legend style={{ position: "absolute", left: "-9999px" }}>
            Velg hvilke kapsler du tillater
          </legend>

          <CategoryRow
            label="Nødvendige"
            description="Sesjon, handlekurv, språk. Kan ikke skrus av."
            checked
            disabled
            onChange={() => {}}
          />
          <CategoryRow
            label="Analyse"
            description="Anonym bruksstatistikk for å forbedre nettstedet."
            checked={analytics}
            onChange={setAnalytics}
          />
          <CategoryRow
            label="Markedsføring"
            description="Personifiserte annonser og retargeting."
            checked={marketing}
            onChange={setMarketing}
          />
        </fieldset>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={rejectAll}
            style={{ ...btnStyle, background: "transparent", border: "1px solid #475569", color: "#cbd5e1" }}
          >
            Avvis valgfrie
          </button>
          <button
            type="button"
            onClick={saveCustom}
            style={{ ...btnStyle, background: "#475569", border: "1px solid #475569", color: "#f8fafc" }}
          >
            Lagre valg
          </button>
          <button
            type="button"
            onClick={acceptAll}
            style={{ ...btnStyle, background: "#16a34a", border: "1px solid #16a34a", color: "#fff" }}
          >
            Godta alle
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
        padding: "0.5rem 0",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: "0.2rem" }}
      />
      <div>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>{description}</div>
      </div>
    </label>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.55rem 1.1rem",
  borderRadius: "6px",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
};
