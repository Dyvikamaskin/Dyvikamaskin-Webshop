import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/formatters";

export const metadata: Metadata = { title: "Mine returer — Dyvikamaskin" };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Venter på behandling",
  APPROVED: "Godkjent",
  RECEIVED: "Mottatt på lager",
  REFUNDED: "Refundert",
  REJECTED: "Avvist",
};

const REASON_LABEL: Record<string, string> = {
  WRONG_ITEM: "Feil vare",
  DEFECTIVE: "Defekt",
  NOT_AS_DESCRIBED: "Ikke som beskrevet",
  DAMAGED_IN_TRANSIT: "Skadet under frakt",
  CHANGED_MIND: "Angrerett (§22)",
  OTHER: "Annet",
};

export default async function MineReturerPage() {
  const user = await requireAuth();

  const [returns, eligibleSales] = await Promise.all([
    prisma.returnRequest.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        sale: { select: { id: true, invoiceNumber: true, totalPrice: true } },
        items: {
          include: {
            saleItem: { select: { productName: true, sku: true } },
          },
        },
      },
    }),
    prisma.sale.findMany({
      where: {
        customerId: user.id,
        status: { in: ["PAID", "INVOICED"] },
        // Hide sales that already have an open or refunded return.
        returnRequests: { none: { status: { in: ["PENDING", "APPROVED", "RECEIVED", "REFUNDED"] } } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, invoiceNumber: true, totalPrice: true, createdAt: true },
    }),
  ]);

  return (
    <main style={{ maxWidth: "880px", padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Mine returer
      </h1>
      <p style={{ color: "#475569", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
        Du har 14 dagers angrerett (Forbrukerkjøpsloven §22) fra varen er
        mottatt. Defekte varer kan returneres innen 2 år.
      </p>

      {/* Existing return requests */}
      <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.75rem" }}>
        Pågående og avsluttede returer
      </h2>

      {returns.length === 0 ? (
        <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>Du har ingen returer ennå.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "2rem" }}>
          {returns.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "0.875rem 1rem",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600 }}>
                  Ordre {r.sale.invoiceNumber ?? r.sale.id.slice(0, 8)} ·{" "}
                  {formatDate(r.createdAt)}
                </span>
                <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0 0 0.3rem" }}>
                Årsak: {REASON_LABEL[r.reason] ?? r.reason}
              </p>
              <ul style={{ listStyle: "disc", paddingLeft: "1.5rem", margin: 0, fontSize: "0.85rem", color: "#475569" }}>
                {r.items.map((it) => (
                  <li key={it.id}>
                    {it.quantity} × {it.saleItem.productName} ({it.saleItem.sku})
                  </li>
                ))}
              </ul>
              {r.refundAmount != null ? (
                <p style={{ marginTop: "0.4rem", fontSize: "0.85rem", color: "#16a34a", fontWeight: 600 }}>
                  Refundert: {formatPrice(r.refundAmount.toString())}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Eligible sales — start a new return */}
      <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.75rem" }}>
        Start ny retur
      </h2>
      {eligibleSales.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Ingen betalte ordrer er kvalifisert for retur akkurat nå.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {eligibleSales.map((s) => (
            <li
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "0.625rem 0.875rem",
                background: "#fff",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>
                {s.invoiceNumber ?? s.id.slice(0, 8)} · {formatDate(s.createdAt)} ·{" "}
                {formatPrice(s.totalPrice.toString())}
              </span>
              <Link
                href={`/konto/retur/ny?saleId=${s.id}`}
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#0f172a",
                  textDecoration: "underline",
                }}
              >
                Opprett retur →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
