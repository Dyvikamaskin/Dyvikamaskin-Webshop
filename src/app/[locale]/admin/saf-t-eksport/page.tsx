import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";

export const metadata: Metadata = { title: "SAF-T eksport — Admin" };

/**
 * /admin/saf-t-eksport — Phase 7
 *
 * Admin landing for downloading a Norwegian SAF-T Financial 1.10 XML
 * for a given period. The form points at GET /api/exports/saft, which
 * streams the XML as an attachment. SUPER_ADMIN-relevant settings
 * (company orgNumber, address) come from env vars; if unset the
 * exported document will still parse but Skatteetaten will reject it.
 */
export default async function SaftExportPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const orgConfigured = Boolean(process.env.COMPANY_ORG_NUMBER);
  const today = new Date();
  const firstOfYear = `${today.getFullYear()}-01-01`;
  const yyyyMmDd = today.toISOString().slice(0, 10);

  return (
    <div style={{ padding: "2rem", maxWidth: "720px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        SAF-T eksport (Skatteetaten)
      </h1>
      <p style={{ color: "#475569", marginBottom: "1.5rem", fontSize: "0.9375rem", lineHeight: 1.5 }}>
        Genererer en XML-fil i SAF-T Financial 1.10-format for valgt
        periode. Inkluderer alle PAID + INVOICED ordrer med
        fakturanummer.
      </p>

      {!orgConfigured ? (
        <div
          style={{
            background: "#fef9c3",
            border: "1px solid #facc15",
            borderRadius: "8px",
            padding: "0.9rem 1.1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            color: "#854d0e",
          }}
        >
          <strong>⚠ Mangler firmadata.</strong> Sett env-variabler{" "}
          <code>COMPANY_ORG_NUMBER</code>, <code>COMPANY_NAME</code>,
          {" "}<code>COMPANY_ADDRESS</code>, <code>COMPANY_POSTAL_CODE</code>,
          {" "}<code>COMPANY_CITY</code> på Railway før innsending til
          Skatteetaten. Filen genereres uansett, men vil ikke bli akseptert.
        </div>
      ) : null}

      <form
        method="GET"
        action="/api/exports/saft"
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.25rem 1.5rem",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label htmlFor="from" style={labelStyle}>Fra dato</label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={firstOfYear}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="to" style={labelStyle}>Til dato</label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={yyyyMmDd}
              required
              style={inputStyle}
            />
          </div>
        </div>
        <button
          type="submit"
          style={{
            padding: "0.6rem 1.4rem",
            background: "#0f172a",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.9rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Last ned SAF-T XML
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.3rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.9rem",
};
