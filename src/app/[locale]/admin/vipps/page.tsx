import { requireRole } from "@/lib/auth";
import {
  listVippsWebhooks,
  testVippsConnection,
  VIPPS_WEBHOOK_EVENTS,
  type VippsWebhookRegistration,
} from "@/lib/vipps";
import { UserRole } from "@/app/generated/prisma/enums";
import { WebhookManager } from "./_WebhookManager";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vipps-integrasjon — Admin" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSet(key: string): boolean {
  return !!process.env[key];
}

const REQUIRED_ENV: { key: string; label: string }[] = [
  { key: "VIPPS_CLIENT_ID",             label: "Client ID" },
  { key: "VIPPS_CLIENT_SECRET",         label: "Client Secret" },
  { key: "VIPPS_MERCHANT_SERIAL_NUMBER", label: "Merchant Serial Number (MSN)" },
  { key: "VIPPS_SUBSCRIPTION_KEY",      label: "Subscription Key (Ocp-Apim)" },
  { key: "VIPPS_WEBHOOK_SECRET",        label: "Webhook Secret" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function VippsPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const isTest   = (process.env.VIPPS_API_BASE_URL ?? "").includes("apitest");
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = appUrl ? `${appUrl}/api/vipps/webhook` : "";

  const credentialsSet = REQUIRED_ENV.filter((e) => e.key !== "VIPPS_WEBHOOK_SECRET").every(
    (e) => isSet(e.key)
  );

  // Try connection test and list webhooks if credentials are set
  let connectionOk: boolean | null = null;
  let connectionError = "";
  let existingWebhooks: VippsWebhookRegistration[] = [];

  if (credentialsSet) {
    const test = await testVippsConnection();
    connectionOk    = test.ok;
    connectionError = test.error ?? "";

    if (test.ok) {
      try {
        existingWebhooks = await listVippsWebhooks();
      } catch {
        // Non-fatal — just show empty list
      }
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "860px" }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Vipps-integrasjon
        </h1>
        <span
          style={{
            padding: "0.3rem 0.75rem",
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            background: isTest ? "#fef3c7" : "#dcfce7",
            color:      isTest ? "#92400e" : "#166534",
          }}
        >
          {isTest ? "TEST-MILJØ" : "PRODUKSJON"}
        </span>
      </div>

      {/* ── Step 1: Credentials ───────────────────────────────────────────── */}
      <Card>
        <SectionTitle step={1} title="API-legitimasjon" />
        <p style={descStyle}>
          Hent disse fra{" "}
          <a
            href="https://portal.vipps.no"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#2563eb" }}
          >
            portal.vipps.no
          </a>{" "}
          → <em>Sales Units</em> → velg salgsenhet → <em>Keys</em>. Legg dem inn i{" "}
          <code style={codeStyle}>.env</code> (lokalt) eller Railway-miljøvariabler.
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={thStyle}>Miljøvariabel</th>
              <th style={thStyle}>Beskrivelse</th>
              <th style={{ ...thStyle, width: "80px", textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {REQUIRED_ENV.map((e) => (
              <tr key={e.key} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.6rem 1rem" }}>
                  <code style={{ fontSize: "0.8rem", background: "#f1f5f9", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                    {e.key}
                  </code>
                </td>
                <td style={{ padding: "0.6rem 1rem", color: "#64748b", fontSize: "0.8rem" }}>{e.label}</td>
                <td style={{ padding: "0.6rem 1rem", textAlign: "center" }}>
                  {isSet(e.key) ? (
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
                  ) : (
                    <span style={{ color: "#dc2626", fontWeight: 700 }}>✗</span>
                  )}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid #f1f5f9" }}>
              <td style={{ padding: "0.6rem 1rem" }}>
                <code style={{ fontSize: "0.8rem", background: "#f1f5f9", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                  VIPPS_API_BASE_URL
                </code>
              </td>
              <td style={{ padding: "0.6rem 1rem", color: "#64748b", fontSize: "0.8rem" }}>
                Sett til <code style={codeStyle}>https://apitest.vipps.no</code> for test, eller blank for produksjon
              </td>
              <td style={{ padding: "0.6rem 1rem", textAlign: "center" }}>
                <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
                  {isTest ? "TEST" : "PROD"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Connection test result */}
        {connectionOk === true && (
          <div style={successBox}>
            ✓ Tilkobling til Vipps API vellykket — legitimasjonen er gyldig.
          </div>
        )}
        {connectionOk === false && (
          <div style={errorBox}>
            ✗ Tilkobling til Vipps API feilet — sjekk legitimasjonen din.
            {connectionError && (
              <pre style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {connectionError}
              </pre>
            )}
          </div>
        )}
        {connectionOk === null && (
          <div style={{ ...infoBox, marginTop: "0.75rem" }}>
            Fyll inn legitimasjonen ovenfor og last siden på nytt for å teste tilkoblingen.
          </div>
        )}
      </Card>

      {/* ── Step 2: App URL ───────────────────────────────────────────────── */}
      <Card>
        <SectionTitle step={2} title="App-URL (retur- og webhook-URL)" />
        <p style={descStyle}>
          Sett <code style={codeStyle}>NEXT_PUBLIC_APP_URL</code> til den offentlig tilgjengelige
          adressen til denne applikasjonen. For lokal testing, bruk{" "}
          <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>ngrok</a>.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Nåværende verdi:</span>
            <code style={{ display: "block", fontFamily: "monospace", fontSize: "0.875rem", color: appUrl ? "#1e293b" : "#dc2626", marginTop: "0.2rem" }}>
              {appUrl || "(ikke satt)"}
            </code>
          </div>
          {appUrl && (
            <div style={{ flex: 1, minWidth: "200px" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Webhook-URL som registreres:</span>
              <code style={{ display: "block", fontFamily: "monospace", fontSize: "0.8rem", color: "#1e293b", marginTop: "0.2rem" }}>
                {webhookUrl}
              </code>
            </div>
          )}
        </div>
      </Card>

      {/* ── Step 3: Webhook registration ──────────────────────────────────── */}
      <Card>
        <SectionTitle step={3} title="Webhook-registrering" />
        <p style={descStyle}>
          Vipps må vite hvilken URL de skal sende betalingshendelser til. Registrer webhook-endepunktet
          én gang per miljø (test/produksjon). Etter registrering vises en hemmelighet —{" "}
          <strong>kopier den umiddelbart</strong> og legg den inn som{" "}
          <code style={codeStyle}>VIPPS_WEBHOOK_SECRET</code>.
        </p>

        {!credentialsSet ? (
          <div style={infoBox}>Fullfør steg 1 (legitimasjon) for å administrere webhooks.</div>
        ) : connectionOk === false ? (
          <div style={errorBox}>Kan ikke koble til Vipps API — sjekk legitimasjonen.</div>
        ) : (
          <WebhookManager
            initialWebhooks={existingWebhooks}
            defaultUrl={webhookUrl}
          />
        )}

        <div style={{ marginTop: "1.25rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>
            Hendelser som mottas:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {VIPPS_WEBHOOK_EVENTS.map((e) => (
              <code
                key={e}
                style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "0.2rem 0.5rem", borderRadius: "4px", color: "#475569" }}
              >
                {e}
              </code>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Step 4: Test checkout ─────────────────────────────────────────── */}
      <Card>
        <SectionTitle step={4} title="Test checkout-flyt" />
        <p style={descStyle}>
          I testmiljøet kan du betale med hvilket som helst norsk mobilnummer. Vipps-testappen
          godtar alle kort og bekrefter automatisk.
        </p>
        <ol style={{ paddingLeft: "1.25rem", fontSize: "0.875rem", color: "#374151", lineHeight: "1.8" }}>
          <li>Last ned <strong>Vipps MT testapp</strong> på telefonen (søk «Vipps MT» i App Store / Google Play)</li>
          <li>Logg inn med testbrukerens mobilnummer (fra portal.vipps.no → Test users)</li>
          <li>Gå til butikken, legg en vare i handlekurven og klikk «Betal med Vipps»</li>
          <li>Fullfør betalingen i testappen — du skal bli sendt tilbake til bekreftelsessiden</li>
          <li>Sjekk at ordren endrer status til <strong>PAID</strong> og at lager trekkes</li>
          <li>Sjekk at revisjonsloggen og varsler (e-post) aktiveres</li>
        </ol>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "1.25rem",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: "#1e40af",
          color: "#fff",
          fontSize: "0.8rem",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {step}
      </span>
      <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>{title}</h2>
    </div>
  );
}

const descStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#374151",
  marginBottom: "1rem",
  lineHeight: "1.6",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.8rem",
  background: "#f1f5f9",
  padding: "0.1rem 0.4rem",
  borderRadius: "3px",
};

const thStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#475569",
  fontSize: "0.8rem",
  borderBottom: "1px solid #e2e8f0",
};

const successBox: React.CSSProperties = {
  marginTop: "0.75rem",
  padding: "0.6rem 1rem",
  background: "#dcfce7",
  border: "1px solid #86efac",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#166534",
};

const errorBox: React.CSSProperties = {
  marginTop: "0.75rem",
  padding: "0.6rem 1rem",
  background: "#fee2e2",
  border: "1px solid #fca5a5",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#991b1b",
};

const infoBox: React.CSSProperties = {
  padding: "0.6rem 1rem",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#1e40af",
};
