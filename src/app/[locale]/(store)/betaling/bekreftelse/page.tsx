import { prisma } from "@/lib/prisma";
import { formatPrice, formatDate } from "@/lib/formatters";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bestilling bekreftet — Dyvikamaskin",
};

interface PageProps {
  searchParams: Promise<{ reference?: string }>;
}

/**
 * Order confirmation page — /betaling/bekreftelse
 *
 * Vipps redirects the user here after payment with ?reference={checkoutSessionId}.
 * We show the order details from the database.
 *
 * Note: the Sale may still be PENDING if the webhook hasn't fired yet.
 * We poll with a simple cache-busting refresh for up to 10 seconds client-side
 * (see the meta refresh below).
 */
export default async function BekreftelsePage({ searchParams }: PageProps) {
  const { reference } = await searchParams;

  if (!reference) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
          Ingen bestillingsreferanse
        </h1>
        <Link href="/" style={{ color: "#1d4ed8" }}>Gå til forsiden</Link>
      </main>
    );
  }

  const sales = await prisma.sale.findMany({
    where: { checkoutSessionId: reference },
    include: {
      store: { select: { name: true } },
      items: {
        select: {
          id: true,
          productName: true,
          sku: true,
          quantity: true,
          unitPriceExclMva: true,
          lineTotalInclMva: true,
          mvaRate: true,
          discountPercentage: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (sales.length === 0) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Bestillingen ble ikke funnet
        </h1>
        <p style={{ color: "#666", marginBottom: "1rem" }}>
          Referanse: {reference}
        </p>
        <Link href="/" style={{ color: "#1d4ed8" }}>Gå til forsiden</Link>
      </main>
    );
  }

  const isPending = sales.some((s) => s.status === "PENDING");
  const grandTotal = sales.reduce((sum, s) => sum + s.totalPrice.toNumber(), 0);
  const firstSale = sales[0];

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "700px",
        margin: "0 auto",
      }}
    >
      {/* Auto-refresh while payment is still processing */}
      {isPending && (
         
        <meta httpEquiv="refresh" content="5" />
      )}

      {/* Status banner */}
      <div
        style={{
          padding: "1.25rem",
          borderRadius: "0.75rem",
          marginBottom: "1.5rem",
          background: isPending ? "#fef9c3" : "#f0fdf4",
          border: `1px solid ${isPending ? "#fde047" : "#86efac"}`,
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          {isPending
            ? "⏳ Betalingen behandles…"
            : "✅ Bestilling bekreftet!"}
        </h1>
        <p style={{ color: "#555", fontSize: "0.9375rem" }}>
          {isPending
            ? "Vi venter på bekreftelse fra Vipps. Siden oppdaterer seg automatisk."
            : `Takk for din bestilling! Referanse: ${reference}`}
        </p>
      </div>

      {/* Order summary per store */}
      {sales.map((sale) => (
        <div
          key={sale.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "0.5rem",
            marginBottom: "1.25rem",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "#f9fafb",
              padding: "0.75rem 1rem",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontWeight: 700 }}>🏪 {sale.store.name}</span>
              <span
                style={{
                  marginLeft: "0.75rem",
                  fontSize: "0.8125rem",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "9999px",
                  background: sale.status === "PAID" ? "#dcfce7" : "#fef9c3",
                  color: sale.status === "PAID" ? "#16a34a" : "#713f12",
                  fontWeight: 600,
                }}
              >
                {sale.status === "PAID" ? "Betalt" : "Venter"}
              </span>
            </div>
            <span style={{ fontSize: "0.875rem", color: "#666" }}>
              {formatDate(sale.createdAt)}
            </span>
          </div>

          <div style={{ padding: "0.75rem 1rem" }}>
            {sale.items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #f3f4f6",
                  fontSize: "0.9rem",
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, marginBottom: "0.125rem" }}>{item.productName}</p>
                  <p style={{ color: "#9ca3af", fontSize: "0.8125rem" }}>
                    Varenr. {item.sku} · Antall: {item.quantity}
                  </p>
                  {item.discountPercentage.toNumber() > 0 && (
                    <p style={{ color: "#16a34a", fontSize: "0.8125rem" }}>
                      {item.discountPercentage.toNumber()}% rabatt
                    </p>
                  )}
                </div>
                <p style={{ fontWeight: 600, minWidth: "5rem", textAlign: "right" }}>
                  {formatPrice(item.lineTotalInclMva.toNumber())}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 700,
            }}
          >
            <span>Delsum inkl. MVA</span>
            <span>{formatPrice(sale.totalPrice.toNumber())}</span>
          </div>
        </div>
      ))}

      {/* Grand total */}
      {sales.length > 1 && (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "0.5rem",
            padding: "1rem",
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: "1.0625rem",
            marginBottom: "1.5rem",
          }}
        >
          <span>Totalt betalt inkl. MVA</span>
          <span>{formatPrice(grandTotal)}</span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link
          href="/produkter"
          style={{
            padding: "0.625rem 1.25rem",
            background: "#1d4ed8",
            color: "#fff",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9375rem",
          }}
        >
          Fortsett å handle
        </Link>
        <Link
          href="/"
          style={{
            padding: "0.625rem 1.25rem",
            border: "1px solid #d1d5db",
            color: "#374151",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9375rem",
          }}
        >
          Til forsiden
        </Link>
      </div>
    </main>
  );
}
