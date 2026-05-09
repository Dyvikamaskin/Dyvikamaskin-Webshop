import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/app/actions/auth";
import { formatDate, formatPrice } from "@/lib/formatters";
import { CustomerType, OrderStatus, FulfillmentStatus } from "@/app/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Min konto — Dyvikamaskin",
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Venter på betaling",
  PAID: "Betalt",
  INVOICED: "Fakturert",
};

const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  UNFULFILLED: "Ikke behandlet",
  PROCESSING: "Under plukking",
  SHIPPED: "Sendt",
  READY_FOR_PICKUP: "Klar for henting",
  COLLECTED: "Hentet",
};

export default async function KontoPage() {
  // requireAuth → redirects to /login if not signed in
  const profile = await getProfile();

  if (!profile.isActive) {
    redirect("/unauthorized");
  }

  const recentSales = await prisma.sale.findMany({
    where: { customerId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      status: true,
      fulfillmentStatus: true,
      totalPrice: true,
      invoiceNumber: true,
      items: { select: { id: true } },
    },
  });

  const isBusiness = profile.customerType === CustomerType.BUSINESS;

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "2rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
            Min konto
          </h1>
          <p style={{ marginTop: "0.25rem", color: "#64748b", fontSize: "0.95rem" }}>
            {profile.fullName || profile.email}
          </p>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            style={{
              padding: "0.5rem 1rem",
              background: "#fff",
              color: "#0f172a",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Logg ut
          </button>
        </form>
      </header>

      {/* ─── Profile card ─────────────────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, marginBottom: "1rem", color: "#0f172a" }}>
          Kontoinformasjon
        </h2>

        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", rowGap: "0.6rem", columnGap: "1.5rem", fontSize: "0.9rem" }}>
          <dt style={{ color: "#64748b" }}>Navn</dt>
          <dd style={{ margin: 0, color: "#0f172a" }}>{profile.fullName || "—"}</dd>

          <dt style={{ color: "#64748b" }}>E-post</dt>
          <dd style={{ margin: 0, color: "#0f172a" }}>{profile.email}</dd>

          {profile.phoneNumber ? (
            <>
              <dt style={{ color: "#64748b" }}>Telefon</dt>
              <dd style={{ margin: 0, color: "#0f172a" }}>{profile.phoneNumber}</dd>
            </>
          ) : null}

          <dt style={{ color: "#64748b" }}>Kundetype</dt>
          <dd style={{ margin: 0, color: "#0f172a" }}>{isBusiness ? "Bedrift" : "Privat"}</dd>

          {isBusiness && profile.companyName ? (
            <>
              <dt style={{ color: "#64748b" }}>Firma</dt>
              <dd style={{ margin: 0, color: "#0f172a" }}>{profile.companyName}</dd>
            </>
          ) : null}

          {isBusiness && profile.orgNumber ? (
            <>
              <dt style={{ color: "#64748b" }}>Organisasjonsnummer</dt>
              <dd style={{ margin: 0, color: "#0f172a" }}>{profile.orgNumber}</dd>
            </>
          ) : null}

          {isBusiness ? (
            <>
              <dt style={{ color: "#64748b" }}>Faktura</dt>
              <dd style={{ margin: 0, color: profile.isApprovedForInvoice ? "#15803d" : "#b45309" }}>
                {profile.isApprovedForInvoice ? "Godkjent" : "Ikke godkjent ennå"}
              </dd>
            </>
          ) : null}

          {profile.address || profile.postalCode || profile.city ? (
            <>
              <dt style={{ color: "#64748b" }}>Adresse</dt>
              <dd style={{ margin: 0, color: "#0f172a", lineHeight: 1.5 }}>
                {profile.address || "—"}
                {profile.postalCode || profile.city ? <br /> : null}
                {[profile.postalCode, profile.city].filter(Boolean).join(" ") || null}
              </dd>
            </>
          ) : null}
        </dl>

        <p style={{ marginTop: "1.25rem", marginBottom: 0, fontSize: "0.8125rem", color: "#94a3b8" }}>
          Endring av kontaktinformasjon kommer snart. Kontakt oss på{" "}
          <a href="mailto:post@dyvikamaskin.no" style={{ color: "#1e40af", textDecoration: "underline" }}>
            post@dyvikamaskin.no
          </a>{" "}
          for endringer i mellomtiden.
        </p>
      </section>

      {/* ─── Recent orders ────────────────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, marginBottom: "1rem", color: "#0f172a" }}>
          Mine bestillinger
        </h2>

        {recentSales.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
            Du har ingen bestillinger ennå.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", fontWeight: 600 }}>
                <th style={{ padding: "0.5rem 0.5rem 0.5rem 0", borderBottom: "1px solid #e2e8f0" }}>Dato</th>
                <th style={{ padding: "0.5rem 0.5rem", borderBottom: "1px solid #e2e8f0" }}>Bestilling</th>
                <th style={{ padding: "0.5rem 0.5rem", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                <th style={{ padding: "0.5rem 0.5rem", borderBottom: "1px solid #e2e8f0" }}>Levering</th>
                <th style={{ padding: "0.5rem 0 0.5rem 0.5rem", borderBottom: "1px solid #e2e8f0", textAlign: "right" }}>Beløp</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td style={{ padding: "0.6rem 0.5rem 0.6rem 0", borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                    {formatDate(sale.createdAt)}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                    {sale.invoiceNumber ?? `#${sale.id.slice(0, 8)}`}
                    <span style={{ color: "#94a3b8", fontSize: "0.8125rem", marginLeft: "0.5rem" }}>
                      {sale.items.length} {sale.items.length === 1 ? "vare" : "varer"}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                    {ORDER_STATUS_LABEL[sale.status]}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                    {FULFILLMENT_LABEL[sale.fulfillmentStatus]}
                  </td>
                  <td style={{ padding: "0.6rem 0 0.6rem 0.5rem", borderBottom: "1px solid #f1f5f9", color: "#0f172a", textAlign: "right" }}>
                    {formatPrice(sale.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ─── Security / quick links ──────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, marginBottom: "1rem", color: "#0f172a" }}>
          Sikkerhet
        </h2>
        <a
          href="/glemt-passord"
          style={{
            display: "inline-block",
            color: "#1e40af",
            textDecoration: "underline",
            fontSize: "0.9rem",
          }}
        >
          Endre passord
        </a>
      </section>
    </main>
  );
}
