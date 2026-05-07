import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus } from "@/app/generated/prisma/enums";
import { QuarterSelector, type QuarterOption } from "./_QuarterSelector";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "MVA-rapport — Admin" };

// ─── Quarter helpers ──────────────────────────────────────────────────────────

function buildQuarters(count = 4): QuarterOption[] {
  const now = new Date();
  const year = now.getFullYear();
  const currentQ = Math.floor(now.getMonth() / 3); // 0-based

  return Array.from({ length: count }, (_, i) => {
    let q = currentQ - i;
    let y = year;
    while (q < 0) { q += 4; y--; }

    const startMonth = q * 3;       // 0-based
    const endMonth   = startMonth + 2;
    const lastDay    = new Date(y, endMonth + 1, 0).getDate();
    const mm = (m: number) => String(m + 1).padStart(2, "0");

    return {
      label: `Q${q + 1} ${y}`,
      from:  `${y}-${mm(startMonth)}-01`,
      to:    `${y}-${mm(endMonth)}-${lastDay}`,
    };
  });
}

function currentQuarterDefault(): { from: string; to: string } {
  return buildQuarters(1)[0];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: { from?: string; to?: string };
}

interface RateGroup {
  rate:       number;          // e.g. 0.25
  pct:        string;          // e.g. "25 %"
  excl:       number;
  mvaAmount:  number;
  incl:       number;
  orderCount: number;
}

export default async function MvaRapportPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const quarters = buildQuarters(5); // current + 4 previous
  const def   = currentQuarterDefault();
  const from  = searchParams.from ?? def.from;
  const to    = searchParams.to   ?? def.to;

  const fromDate = new Date(from);
  const toDate   = new Date(to + "T23:59:59.999Z");

  // Load all sale items for PAID/INVOICED orders in range
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        status:    { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
        createdAt: { gte: fromDate, lte: toDate },
      },
    },
    select: {
      mvaRate:          true,
      lineTotalExclMva: true,
      lineTotalInclMva: true,
      saleId:           true,
    },
  });

  // Group by MVA rate
  const map = new Map<string, { excl: number; incl: number; sales: Set<string> }>();

  for (const item of items) {
    const rateKey = item.mvaRate.toFixed(4);
    const g = map.get(rateKey) ?? { excl: 0, incl: 0, sales: new Set() };
    g.excl += item.lineTotalExclMva.toNumber();
    g.incl += item.lineTotalInclMva.toNumber();
    g.sales.add(item.saleId);
    map.set(rateKey, g);
  }

  const groups: RateGroup[] = Array.from(map.entries())
    .map(([rateKey, g]) => {
      const rate = parseFloat(rateKey);
      return {
        rate,
        pct:        `${Math.round(rate * 100)} %`,
        excl:       g.excl,
        mvaAmount:  g.incl - g.excl,
        incl:       g.incl,
        orderCount: g.sales.size,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  const grand = groups.reduce(
    (acc, g) => ({
      excl:      acc.excl      + g.excl,
      mvaAmount: acc.mvaAmount + g.mvaAmount,
      incl:      acc.incl      + g.incl,
    }),
    { excl: 0, mvaAmount: 0, incl: 0 }
  );

  // Count distinct orders for the period (regardless of MVA rate)
  const totalOrders = await prisma.sale.count({
    where: {
      status:    { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
      createdAt: { gte: fromDate, lte: toDate },
    },
  });

  const csvUrl = `/api/exports/mva?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          MVA-rapport
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
          ⬇ Last ned CSV
        </a>
      </div>

      <QuarterSelector quarters={quarters} from={from} to={to} />

      <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.5rem" }}>
        Periode: <strong>{from}</strong> – <strong>{to}</strong> &nbsp;·&nbsp;
        {totalOrders} ordre{totalOrders !== 1 ? "r" : ""} med {items.length} varelinjer
      </p>

      {/* MVA breakdown table */}
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          marginBottom: "2rem",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["MVA-sats", "Ant. ordrer", "Grunnlag (ekskl. MVA)", "MVA-beløp", "Totalt (inkl. MVA)"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.75rem 1.25rem",
                      textAlign: h === "MVA-sats" || h === "Ant. ordrer" ? "left" : "right",
                      fontWeight: 600,
                      color: "#475569",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.pct} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.75rem 1.25rem", fontWeight: 600, color: "#1e293b" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.25rem 0.65rem",
                      borderRadius: "999px",
                      fontSize: "0.8rem",
                      background: g.rate > 0 ? "#fef3c7" : "#f1f5f9",
                      color: g.rate > 0 ? "#92400e" : "#475569",
                    }}
                  >
                    {g.pct}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 1.25rem", color: "#374151" }}>{g.orderCount}</td>
                <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", color: "#374151" }}>
                  {kr(g.excl)}
                </td>
                <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", color: "#b45309", fontWeight: 600 }}>
                  {kr(g.mvaAmount)}
                </td>
                <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", color: "#374151" }}>
                  {kr(g.incl)}
                </td>
              </tr>
            ))}

            {groups.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                  Ingen betalte ordrer i valgt periode.
                </td>
              </tr>
            )}

            {/* Grand total */}
            {groups.length > 0 && (
              <tr
                style={{
                  borderTop: "2px solid #cbd5e1",
                  background: "#f8fafc",
                }}
              >
                <td
                  colSpan={2}
                  style={{ padding: "0.875rem 1.25rem", fontWeight: 700, color: "#0f172a" }}
                >
                  Totalt
                </td>
                <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                  {kr(grand.excl)}
                </td>
                <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 700, color: "#b45309" }}>
                  {kr(grand.mvaAmount)}
                </td>
                <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 700, color: "#1e40af" }}>
                  {kr(grand.incl)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Explanatory note */}
      {groups.length > 0 && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            fontSize: "0.85rem",
            color: "#1e40af",
          }}
        >
          <strong>Innberetningsveiledning:</strong> MVA-beløpet per sats oppgis i skattemeldingen for
          MVA. Totalt innberetningsgrunnlag: <strong>{kr(grand.excl)}</strong> ekskl. MVA, herav
          MVA <strong>{kr(grand.mvaAmount)}</strong>.
        </div>
      )}
    </div>
  );
}

function kr(n: number): string {
  return n.toLocaleString("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
