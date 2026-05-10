import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { formatDate, formatPrice } from "@/lib/formatters";
import { ReturnActionsBar } from "@/components/admin/ReturnActionsBar";

export const metadata: Metadata = { title: "Returdetaljer — Admin" };

export default async function AdminReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(UserRole.STORE_MANAGER);
  const { id } = await params;

  const r = await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          totalPrice: true,
          vippsReference: true,
          customer: { select: { fullName: true, email: true, address: true, postalCode: true, city: true } },
        },
      },
      items: {
        include: {
          saleItem: { select: { sku: true, productName: true, quantity: true, unitPriceExclMva: true } },
        },
      },
    },
  });
  if (!r) notFound();

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Returforespørsel
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Opprettet {formatDate(r.createdAt)} · Status:{" "}
        <strong style={{ color: "#0f172a" }}>{r.status}</strong>
      </p>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.6rem" }}>Ordre</h2>
        <p style={{ margin: "0.2rem 0", fontSize: "0.875rem" }}>
          {r.sale.invoiceNumber ?? r.sale.id.slice(0, 8)} · {formatPrice(r.sale.totalPrice.toString())}
        </p>
        <p style={{ margin: "0.2rem 0", fontSize: "0.875rem", color: "#475569" }}>
          {r.sale.customer?.fullName ?? "—"} ({r.sale.customer?.email})
        </p>
        <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#94a3b8" }}>
          Betalt via: {r.sale.vippsReference ? "Vipps" : "Faktura"}
        </p>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.6rem" }}>Returårsak</h2>
        <p style={{ margin: "0.2rem 0", fontSize: "0.875rem" }}>{r.reason}</p>
        {r.notes ? (
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.875rem", color: "#475569" }}>
            <em>{r.notes}</em>
          </p>
        ) : null}
      </section>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.6rem" }}>Returvarer</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", fontSize: "0.75rem" }}>
              <th style={{ padding: "0.3rem 0" }}>Vare</th>
              <th style={{ padding: "0.3rem 0" }}>SKU</th>
              <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Antall</th>
              <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Pris ekskl.</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((it) => (
              <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.4rem 0" }}>{it.saleItem.productName}</td>
                <td style={{ padding: "0.4rem 0", fontFamily: "monospace" }}>{it.saleItem.sku}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{it.quantity}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{formatPrice(it.saleItem.unitPriceExclMva.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ReturnActionsBar
        returnRequestId={r.id}
        status={r.status}
        maxRefundAmount={r.sale.totalPrice.toString()}
        hasVipps={Boolean(r.sale.vippsReference)}
      />
    </div>
  );
}
