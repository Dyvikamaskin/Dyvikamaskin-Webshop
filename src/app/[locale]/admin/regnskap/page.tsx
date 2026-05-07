import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus } from "@/app/generated/prisma/enums";
import { DateRangeForm } from "./_DateRangeForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Regnskapseksport — Admin" };

const PREVIEW_LIMIT = 50;

interface Props {
  searchParams: { from?: string; to?: string };
}

// ── Defaults: first day of current month → today ──────────────────────────────
function defaultRange(): { from: string; to: string } {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day   = String(now.getDate()).padStart(2, "0");
  return {
    from: `${year}-${month}-01`,
    to:   `${year}-${month}-${day}`,
  };
}

function kr(n: number): string {
  return n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function RegnskapPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const def   = defaultRange();
  const from  = searchParams.from ?? def.from;
  const to    = searchParams.to   ?? def.to;

  const fromDate = new Date(from);
  const toDate   = new Date(to + "T23:59:59.999Z");

  const [sales, totalCount] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status:    { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
        createdAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { createdAt: "asc" },
      take: PREVIEW_LIMIT,
      select: {
        id:              true,
        invoiceNumber:   true,
        kidNumber:       true,
        invoiceDueDate:  true,
        createdAt:       true,
        subtotalExclMva: true,
        mvaAmount:       true,
        shippingCost:    true,
        totalPrice:      true,
        status:          true,
        customer: {
          select: { fullName: true, orgNumber: true, companyName: true },
        },
      },
    }),
    prisma.sale.count({
      where: {
        status:    { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
        createdAt: { gte: fromDate, lte: toDate },
      },
    }),
  ]);

  // Totals
  const totals = sales.reduce(
    (acc, s) => {
      acc.excl += s.subtotalExclMva.toNumber();
      acc.mva  += s.mvaAmount.toNumber();
      acc.ship += s.shippingCost.toNumber();
      acc.incl += s.totalPrice.toNumber();
      return acc;
    },
    { excl: 0, mva: 0, ship: 0, incl: 0 }
  );

  const csvUrl = `/api/exports/regnskap?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <div style={{ padding: "2rem", maxWidth: "1300px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Regnskapseksport
        </h1>
        <a
          href={csvUrl}
          download
          style={{
            padding: "0.55rem 1.25rem",
            background: "#16a34a",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          ⬇ Last ned CSV ({totalCount} rader)
        </a>
      </div>

      <DateRangeForm from={from} to={to} />

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <SummaryCard label="Antall ordrer"     value={totalCount.toLocaleString("nb-NO")} />
        <SummaryCard label="Subtotal ekskl. MVA" value={`kr ${kr(totals.excl)}`} />
        <SummaryCard label="MVA-beløp"         value={`kr ${kr(totals.mva)}`} />
        <SummaryCard label="Frakt"             value={`kr ${kr(totals.ship)}`} />
        <SummaryCard label="Totalt inkl. MVA"  value={`kr ${kr(totals.incl)}`} highlight />
      </div>

      {totalCount > PREVIEW_LIMIT && (
        <p style={{ fontSize: "0.875rem", color: "#92400e", background: "#fef3c7", padding: "0.6rem 1rem", borderRadius: "6px", marginBottom: "1rem" }}>
          Viser de første {PREVIEW_LIMIT} av {totalCount} rader. Last ned CSV for alle.
        </p>
      )}

      {/* Preview table */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {[
                "Fakturanr", "Ordredato", "Forfallsdato", "Kundenavn",
                "Orgnr", "Ekskl. MVA", "MVA", "Frakt", "Totalt", "Status",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "#475569",
                    whiteSpace: "nowrap",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={td}>{s.invoiceNumber ?? "–"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{s.createdAt.toLocaleDateString("nb-NO")}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{s.invoiceDueDate?.toLocaleDateString("nb-NO") ?? "–"}</td>
                <td style={td}>{s.customer?.companyName ?? s.customer?.fullName ?? "–"}</td>
                <td style={{ ...td, fontFamily: "monospace" }}>{s.customer?.orgNumber ?? "–"}</td>
                <td style={{ ...td, textAlign: "right" }}>{kr(s.subtotalExclMva.toNumber())}</td>
                <td style={{ ...td, textAlign: "right" }}>{kr(s.mvaAmount.toNumber())}</td>
                <td style={{ ...td, textAlign: "right" }}>{kr(s.shippingCost.toNumber())}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{kr(s.totalPrice.toNumber())}</td>
                <td style={td}>
                  <span
                    style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background: s.status === "INVOICED" ? "#dbeafe" : "#dcfce7",
                      color: s.status === "INVOICED" ? "#1e40af" : "#166534",
                    }}
                  >
                    {s.status === "INVOICED" ? "Fakturert" : "Betalt"}
                  </span>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                  Ingen betalte ordrer i valgt periode.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: "0.5rem 0.75rem", color: "#374151" };

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        border: `1px solid ${highlight ? "#3b82f6" : "#e2e8f0"}`,
        padding: "1rem 1.25rem",
        borderLeft: `4px solid ${highlight ? "#3b82f6" : "#94a3b8"}`,
      }}
    >
      <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "#64748b" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: highlight ? "#1e40af" : "#0f172a" }}>
        {value}
      </p>
    </div>
  );
}
