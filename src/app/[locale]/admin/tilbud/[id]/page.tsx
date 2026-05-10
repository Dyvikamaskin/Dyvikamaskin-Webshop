import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { formatDate, formatPrice } from "@/lib/formatters";
import { QuoteActionsBar } from "@/components/admin/QuoteActionsBar";

export const metadata: Metadata = { title: "Tilbudsdetaljer — Admin" };

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(UserRole.STORE_MANAGER);
  const { id } = await params;

  const q = await prisma.quote.findUnique({
    where: { id },
    include: {
      items: true,
      store: { select: { name: true } },
      convertedSale: { select: { id: true, invoiceNumber: true } },
    },
  });
  if (!q) notFound();

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Tilbud {q.quoteNumber}
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Opprettet {formatDate(q.createdAt)} · Status:{" "}
        <strong style={{ color: "#0f172a" }}>{q.status}</strong>
        {q.validUntil ? ` · Gyldig til ${formatDate(q.validUntil)}` : ""}
      </p>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0 }}>Kunde</h2>
        <p style={{ margin: "0.2rem 0", fontSize: "0.875rem" }}>{q.customerName ?? "—"} ({q.customerEmail})</p>
        {q.customerCompany ? (
          <p style={{ margin: "0.2rem 0", fontSize: "0.875rem", color: "#475569" }}>{q.customerCompany}</p>
        ) : null}
        <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#94a3b8" }}>
          Behandlende butikk: {q.store.name}
        </p>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.5rem" }}>Linjer</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", fontSize: "0.75rem" }}>
              <th style={{ padding: "0.3rem 0" }}>Vare</th>
              <th style={{ padding: "0.3rem 0" }}>SKU</th>
              <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Antall</th>
              <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Enhetspris</th>
              <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Sum ekskl.</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((it) => (
              <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.4rem 0" }}>{it.productName}</td>
                <td style={{ padding: "0.4rem 0", fontFamily: "monospace" }}>{it.sku}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{it.quantity}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{formatPrice(it.unitPriceExclMva.toString())}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{formatPrice(it.lineTotalExclMva.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ textAlign: "right", margin: "0.5rem 0 0", fontWeight: 700 }}>
          Total: {formatPrice(q.totalPrice.toString())} (inkl. MVA)
        </p>
      </section>

      {q.notes ? (
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.4rem" }}>Notater fra kunde</h2>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#475569" }}>{q.notes}</p>
        </section>
      ) : null}

      {q.convertedSale ? (
        <p style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "0.75rem 1rem", color: "#166534", fontSize: "0.875rem" }}>
          ✓ Konvertert til ordre {q.convertedSale.invoiceNumber ?? q.convertedSale.id.slice(0, 8)}.
        </p>
      ) : (
        <QuoteActionsBar quoteId={q.id} status={q.status} />
      )}
    </div>
  );
}
