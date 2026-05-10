import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";
import { formatDate, formatPrice } from "@/lib/formatters";

export const metadata: Metadata = { title: "Tilbud — Admin" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Utkast",
  SENT: "Sendt",
  ACCEPTED: "Akseptert",
  REJECTED: "Avvist",
  EXPIRED: "Utløpt",
  CONVERTED: "Konvertert til ordre",
};

export default async function AdminTilbudPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      store: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1180px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Tilbud (RFQ)
      </h1>

      {quotes.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Ingen tilbudsforespørsler ennå.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
          <thead style={{ background: "#f8fafc", fontSize: "0.8rem", textAlign: "left", color: "#475569" }}>
            <tr>
              <th style={th}>Tilbudsnr.</th>
              <th style={th}>Dato</th>
              <th style={th}>Kunde</th>
              <th style={th}>Selskap</th>
              <th style={th}>Linjer</th>
              <th style={th}>Sum</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} style={{ borderTop: "1px solid #f1f5f9", fontSize: "0.875rem" }}>
                <td style={{ ...td, fontFamily: "monospace" }}>{q.quoteNumber}</td>
                <td style={td}>{formatDate(q.createdAt)}</td>
                <td style={td}>{q.customerName ?? q.customerEmail}<br /><span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{q.customerEmail}</span></td>
                <td style={td}>{q.customerCompany ?? "—"}</td>
                <td style={td}>{q._count.items}</td>
                <td style={td}>{formatPrice(q.totalPrice.toString())}</td>
                <td style={td}>{STATUS_LABEL[q.status] ?? q.status}</td>
                <td style={td}>
                  <Link href={`/admin/tilbud/${q.id}`} style={{ color: "#0f172a", textDecoration: "underline", fontSize: "0.85rem" }}>
                    Behandle →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.6rem 0.75rem", fontWeight: 700 };
const td: React.CSSProperties = { padding: "0.6rem 0.75rem", verticalAlign: "top" };
