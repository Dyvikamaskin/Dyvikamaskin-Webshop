import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { formatDate, formatPrice } from "@/lib/formatters";

export const metadata: Metadata = { title: "Returer — Admin" };

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "Venter",     color: "#f59e0b" },
  APPROVED: { label: "Godkjent",   color: "#3b82f6" },
  RECEIVED: { label: "Mottatt",    color: "#8b5cf6" },
  REFUNDED: { label: "Refundert",  color: "#16a34a" },
  REJECTED: { label: "Avvist",     color: "#dc2626" },
};

const REASON_LABEL: Record<string, string> = {
  WRONG_ITEM: "Feil vare",
  DEFECTIVE: "Defekt",
  NOT_AS_DESCRIBED: "Ikke som beskrevet",
  DAMAGED_IN_TRANSIT: "Skadet i frakt",
  CHANGED_MIND: "Angrerett",
  OTHER: "Annet",
};

export default async function AdminReturerPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const returns = await prisma.returnRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          totalPrice: true,
          customer: { select: { fullName: true, email: true } },
        },
      },
      items: {
        select: {
          quantity: true,
          saleItem: { select: { sku: true, productName: true } },
        },
      },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1180px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Returer
      </h1>

      {returns.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Ingen returforespørsler.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
          <thead style={{ background: "#f8fafc", fontSize: "0.8rem", textAlign: "left", color: "#475569" }}>
            <tr>
              <th style={th}>Dato</th>
              <th style={th}>Ordre</th>
              <th style={th}>Kunde</th>
              <th style={th}>Varer</th>
              <th style={th}>Årsak</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => {
              const badge = STATUS_BADGE[r.status];
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9", fontSize: "0.875rem" }}>
                  <td style={td}>{formatDate(r.createdAt)}</td>
                  <td style={td}>{r.sale.invoiceNumber ?? r.sale.id.slice(0, 8)}<br /><span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{formatPrice(r.sale.totalPrice.toString())}</span></td>
                  <td style={td}>{r.sale.customer?.fullName ?? "—"}<br /><span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{r.sale.customer?.email ?? ""}</span></td>
                  <td style={td}>
                    {r.items.map((it, idx) => (
                      <div key={idx} style={{ fontSize: "0.8rem" }}>
                        {it.quantity} × {it.saleItem.productName} ({it.saleItem.sku})
                      </div>
                    ))}
                  </td>
                  <td style={td}>{REASON_LABEL[r.reason] ?? r.reason}</td>
                  <td style={td}>
                    <span style={{ display: "inline-block", padding: "0.2rem 0.5rem", borderRadius: "4px", background: badge.color, color: "#fff", fontSize: "0.7rem", fontWeight: 600 }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={td}>
                    <Link href={`/admin/retur/${r.id}`} style={{ color: "#0f172a", textDecoration: "underline", fontSize: "0.85rem" }}>
                      Behandle →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.6rem 0.75rem", fontWeight: 700 };
const td: React.CSSProperties = { padding: "0.6rem 0.75rem", verticalAlign: "top" };
