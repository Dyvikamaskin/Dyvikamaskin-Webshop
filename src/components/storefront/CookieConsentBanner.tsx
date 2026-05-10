"use client";

import CookieConsent from "react-cookie-consent";

/**
 * GDPR cookie consent banner — Phase 9
 *
 * Shown to every visitor on first arrival. We deliberately keep this
 * binary (accept / decline) for v1 — granular per-category preferences
 * (analytics vs essential vs marketing) live as a Phase 9 follow-up.
 *
 * Essential cookies (Supabase session, cart Zustand persist, locale)
 * always work regardless of consent — they're required for the site
 * to function. The banner only gates non-essential analytics/marketing
 * cookies, which today we don't use; the banner is currently more
 * about legal posture than technical gating.
 */
export function CookieConsentBanner() {
  return (
    <CookieConsent
      location="bottom"
      cookieName="dyvikamaskin-cookie-consent"
      expires={365}
      buttonText="Godta"
      declineButtonText="Avvis ikke-nødvendige"
      enableDeclineButton
      style={{
        background: "#0f172a",
        color: "#f8fafc",
        padding: "1rem 1.5rem",
        fontSize: "0.875rem",
        alignItems: "center",
      }}
      buttonStyle={{
        background: "#16a34a",
        color: "#fff",
        fontSize: "0.875rem",
        fontWeight: 600,
        padding: "0.55rem 1.1rem",
        borderRadius: "6px",
        border: "none",
      }}
      declineButtonStyle={{
        background: "transparent",
        color: "#cbd5e1",
        fontSize: "0.875rem",
        padding: "0.55rem 1.1rem",
        border: "1px solid #475569",
        borderRadius: "6px",
        marginRight: "0.5rem",
      }}
    >
      Vi bruker informasjonskapsler for at nettstedet skal fungere
      (handlekurv, innlogging). Du kan lese mer på{" "}
      <a href="/personvern" style={{ color: "#93c5fd", textDecoration: "underline" }}>
        personvern-siden
      </a>{" "}
      og avvise valgfrie kapsler nedenfor.
    </CookieConsent>
  );
}
