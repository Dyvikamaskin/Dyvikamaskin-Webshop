import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus, FulfillmentStatus } from "@/app/generated/prisma/enums";
import { BackupWidget } from "@/components/admin/BackupWidget";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Oversikt — Admin" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // Monday
  return r;
}

function startOfMonth(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

function kr(val: { toNumber(): number } | number): string {
  const n = typeof val === "number" ? val : val.toNumber();
  return n.toLocaleString("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 });
}

// ─── Gross margin (estimat) ───────────────────────────────────────────────────
// COGS = quantity × Product.purchasePrice at query time (current cost, not
// historical). Items without a purchasePrice contribute zero cost; the
// per-period coverage ratio is surfaced as a footnote on the tile so the
// reader knows when the figure is partial. A historical snapshot on SaleItem
// is the audit-grade fix and is parked for a later pass.

interface MarginRow {
  revenue_ex:   string | number;
  cogs:         string | number;
  priced_items: bigint | number;
  total_items:  bigint | number;
}

async function getMarginForPeriod(since: Date): Promise<{
  revenueEx:   number;
  cogs:        number;
  margin:      number;
  marginPct:   number;
  pricedItems: number;
  totalItems:  number;
}> {
  const rows = await prisma.$queryRaw<MarginRow[]>`
    WITH paid AS (
      SELECT id, "subtotalExclMva"
      FROM "Sale"
      WHERE status IN ('PAID', 'INVOICED') AND "createdAt" >= ${since}
    ),
    cogs AS (
      SELECT si."saleId",
             SUM(si.quantity * COALESCE(p."purchasePrice", 0)) AS sale_cogs,
             SUM(CASE WHEN p."purchasePrice" IS NULL THEN 0 ELSE 1 END) AS priced_items,
             COUNT(*) AS total_items
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si."productId"
      WHERE si."saleId" IN (SELECT id FROM paid)
      GROUP BY si."saleId"
    )
    SELECT
      COALESCE(SUM(p."subtotalExclMva"), 0)::numeric AS revenue_ex,
      COALESCE(SUM(c.sale_cogs), 0)::numeric         AS cogs,
      COALESCE(SUM(c.priced_items), 0)::int          AS priced_items,
      COALESCE(SUM(c.total_items), 0)::int           AS total_items
    FROM paid p
    LEFT JOIN cogs c ON c."saleId" = p.id;
  `;
  const row = rows[0];
  const revenueEx   = row ? Number(row.revenue_ex)   : 0;
  const cogs        = row ? Number(row.cogs)         : 0;
  const pricedItems = row ? Number(row.priced_items) : 0;
  const totalItems  = row ? Number(row.total_items)  : 0;
  const margin      = revenueEx - cogs;
  const marginPct   = revenueEx > 0 ? (margin / revenueEx) * 100 : 0;
  return { revenueEx, cogs, margin, marginPct, pricedItems, totalItems };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const now = new Date();
  const today    = startOfDay(now);
  const thisWeek = startOfWeek(now);
  const thisMon  = startOfMonth(now);

  const paidStatuses = { in: [OrderStatus.PAID, OrderStatus.INVOICED] };

  const [
    ordersToday,
    pendingOrders,
    unfulfilledOrders,
    activePromotions,
    totalCustomers,
    revWeekAgg,
    revMonAgg,
    revTodayAgg,
    lowStockCount,
    recentOrders,
    recentAudit,
    marginToday,
    marginWeek,
    marginMonth,
  ] = await Promise.all([
    prisma.sale.count({ where: { createdAt: { gte: today } } }),
    prisma.sale.count({ where: { status: OrderStatus.PENDING } }),
    prisma.sale.count({
      where: {
        fulfillmentStatus: {
          in: [FulfillmentStatus.UNFULFILLED, FulfillmentStatus.PROCESSING],
        },
      },
    }),
    prisma.promotion.count({ where: { isActive: true } }),
    prisma.profile.count({ where: { role: null } }),

    // ── Omsetning eks. MVA (Phase: gross-margin fix-forward) ──────────────
    // Was: _sum: { totalPrice } (incl. MVA). "Omsetning" in Norwegian
    // accounting means net revenue ex-MVA — MVA is pass-through tax, not
    // company revenue. Switched to subtotalExclMva so the figure matches
    // the new Bruttofortjeneste tiles below.
    prisma.sale.aggregate({
      _sum: { subtotalExclMva: true },
      where: { status: paidStatuses, createdAt: { gte: thisWeek } },
    }),
    prisma.sale.aggregate({
      _sum: { subtotalExclMva: true },
      where: { status: paidStatuses, createdAt: { gte: thisMon } },
    }),
    prisma.sale.aggregate({
      _sum: { subtotalExclMva: true },
      where: { status: paidStatuses, createdAt: { gte: today } },
    }),

    // Items at or below their low-stock threshold
    prisma.storeStock.count({
      where: {
        product: { isActive: true },
        quantity: { lte: prisma.storeStock.fields.lowStockThreshold },
      },
    }),

    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        status: true,
        fulfillmentStatus: true,
        totalPrice: true,
        orderSource: true,
        customer: { select: { fullName: true, email: true } },
      },
    }),

    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    }),

    // ── Gross margin per period (raw SQL — joins Sale → SaleItem → Product
    //    and sums quantity × purchasePrice as COGS) ──────────────────────────
    getMarginForPeriod(today),
    getMarginForPeriod(thisWeek),
    getMarginForPeriod(thisMon),
  ]);

  const revToday = revTodayAgg._sum.subtotalExclMva?.toNumber() ?? 0;
  const revWeek  = revWeekAgg._sum.subtotalExclMva?.toNumber()  ?? 0;
  const revMonth = revMonAgg._sum.subtotalExclMva?.toNumber()   ?? 0;

  return (
    <div style={{ padding: "2rem", maxWidth: "1280px" }}>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#0f172a",
          marginBottom: "1.75rem",
        }}
      >
        Oversikt
      </h1>

      <BackupWidget />

      {/* ── Stat cards — operations ─────────────────────────────────────────── */}
      <h2 style={sectionTitle}>Operasjon</h2>
      <div style={gridStyle}>
        <StatCard label="Ordrer i dag"        value={ordersToday}      color="#3b82f6" />
        <StatCard label="Ventende betaling"   value={pendingOrders}    color="#f59e0b" />
        <StatCard label="Uekspederte ordrer"  value={unfulfilledOrders} color="#ef4444" />
        <StatCard label="Aktive kampanjer"    value={activePromotions} color="#10b981" />
        <StatCard label="Kunder totalt"       value={totalCustomers}   color="#8b5cf6" />
        <StatCard
          label="Lavt lager"
          value={lowStockCount}
          color={lowStockCount > 0 ? "#f97316" : "#10b981"}
          href="/admin/lager"
        />
      </div>

      {/* ── Stat cards — revenue (ex-MVA) ────────────────────────────────────── */}
      <h2 style={{ ...sectionTitle, marginTop: "2rem" }}>
        Omsetning (eks. MVA, betalte ordrer)
      </h2>
      <div style={gridStyle}>
        <RevenueCard label="I dag"     amount={kr(revToday)} color="#0ea5e9" />
        <RevenueCard label="Denne uka" amount={kr(revWeek)}  color="#6366f1" />
        <RevenueCard label="Denne mnd" amount={kr(revMonth)} color="#ec4899" />
      </div>

      {/* ── Stat cards — gross margin (estimat) ──────────────────────────────── */}
      <h2 style={{ ...sectionTitle, marginTop: "2rem" }}>
        Bruttofortjeneste (estimat)
      </h2>
      <div style={gridStyle}>
        <MarginCard label="I dag"     data={marginToday} color="#0ea5e9" />
        <MarginCard label="Denne uka" data={marginWeek}  color="#6366f1" />
        <MarginCard label="Denne mnd" data={marginMonth} color="#ec4899" />
      </div>

      {/* ── Recent orders ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={sectionTitle}>Siste ordrer</h2>
          <Link href="/admin/ordrer" style={linkStyle}>Se alle →</Link>
        </div>
        <div style={tableCard}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                {["Ordre-ID", "Kunde", "Kilde", "Status", "Fullføring", "Totalt", "Dato"].map(
                  (h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((sale) => (
                <tr key={sale.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>
                    <a
                      href={`/admin/ordrer/${sale.id}`}
                      style={{ color: "#2563eb", textDecoration: "none", fontFamily: "monospace", fontSize: "0.8rem" }}
                    >
                      {sale.id.slice(0, 8)}…
                    </a>
                  </td>
                  <td style={tdStyle}>
                    {sale.customer?.fullName ?? <em style={{ color: "#94a3b8" }}>Gjest</em>}
                  </td>
                  <td style={tdStyle}><SourceBadge source={sale.orderSource} /></td>
                  <td style={tdStyle}><StatusBadge status={sale.status} /></td>
                  <td style={tdStyle}><FulfillmentBadge status={sale.fulfillmentStatus} /></td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {kr(sale.totalPrice)}
                  </td>
                  <td style={{ ...tdStyle, color: "#64748b", whiteSpace: "nowrap" }}>
                    {sale.createdAt.toLocaleDateString("nb-NO")}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                    Ingen ordrer enda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Recent audit entries ─────────────────────────────────────────────── */}
      <section style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={sectionTitle}>Siste aktivitet</h2>
          <Link href="/admin/revisjonslogg" style={linkStyle}>Se hele loggen →</Link>
        </div>
        <div style={tableCard}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                {["Tidspunkt", "Aktør", "Hendelse", "Mål"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAudit.map((entry) => (
                <tr key={entry.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ ...tdStyle, color: "#64748b", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                    {entry.createdAt.toLocaleString("nb-NO")}
                  </td>
                  <td style={tdStyle}>{entry.actor.fullName}</td>
                  <td style={tdStyle}>
                    <code style={{ fontSize: "0.75rem", background: "#f1f5f9", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                      {entry.action}
                    </code>
                  </td>
                  <td style={{ ...tdStyle, color: "#64748b", fontSize: "0.8rem" }}>
                    {entry.targetType} <span style={{ fontFamily: "monospace" }}>{entry.targetId.slice(0, 8)}…</span>
                  </td>
                </tr>
              ))}
              {recentAudit.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                    Ingen aktivitet enda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Quick links ──────────────────────────────────────────────────────── */}
      <section style={{ marginTop: "2.5rem", marginBottom: "2rem" }}>
        <h2 style={sectionTitle}>Hurtiglenker</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {[
            { href: "/admin/regnskap",    label: "📊 Regnskapseksport" },
            { href: "/admin/mva-rapport", label: "🧾 MVA-rapport" },
            { href: "/admin/revisjonslogg", label: "🔍 Revisjonslogg" },
            { href: "/admin/batch",       label: "🚀 Batchutsending" },
            { href: "/admin/stocktake",   label: "🔢 Varetelling" },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{
                display: "inline-block",
                padding: "0.6rem 1.1rem",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                color: "#374151",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "#1e293b",
  marginBottom: "0.75rem",
  marginTop: 0,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
  gap: "1rem",
};

const tableCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  overflow: "hidden",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.875rem",
};

const thStyle: React.CSSProperties = {
  padding: "0.625rem 1rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#475569",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = { padding: "0.625rem 1rem", color: "#374151" };

const linkStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#2563eb",
  textDecoration: "none",
};

function StatCard({
  label,
  value,
  color,
  href,
}: {
  label: string;
  value: number;
  color: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        padding: "1.25rem 1.5rem",
        borderLeft: `4px solid ${color}`,
        textDecoration: "none",
      }}
    >
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", marginBottom: "0.4rem" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "#0f172a" }}>{value}</p>
    </div>
  );
  if (href) return <a href={href} style={{ textDecoration: "none" }}>{inner}</a>;
  return inner;
}

function RevenueCard({ label, amount, color }: { label: string; amount: string; color: string }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        padding: "1.25rem 1.5rem",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", marginBottom: "0.4rem" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#0f172a" }}>{amount}</p>
    </div>
  );
}

function MarginCard({
  label,
  data,
  color,
}: {
  label: string;
  data: {
    margin:      number;
    marginPct:   number;
    pricedItems: number;
    totalItems:  number;
  };
  color: string;
}) {
  const hasSales = data.totalItems > 0;
  const coverage = hasSales
    ? `${data.pricedItems} av ${data.totalItems} varer har innkjøpspris`
    : null;
  const pctTone =
    data.marginPct >= 30 ? "#16a34a" : data.marginPct >= 10 ? "#0f172a" : "#dc2626";
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        padding: "1.25rem 1.5rem",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", marginBottom: "0.4rem" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#0f172a" }}>
        {kr(data.margin)}
      </p>
      <p
        style={{
          margin: "0.25rem 0 0",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: hasSales ? pctTone : "#94a3b8",
        }}
      >
        {hasSales ? `${data.marginPct.toFixed(1)} %` : "—"}
      </p>
      {coverage && data.pricedItems < data.totalItems && (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.7rem", color: "#94a3b8" }}>
          {coverage}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Venter",    bg: "#fef9c3", color: "#854d0e" },
    PAID:     { label: "Betalt",    bg: "#dcfce7", color: "#166534" },
    INVOICED: { label: "Fakturert", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return <Badge {...s} />;
}

function FulfillmentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    UNFULFILLED:      { label: "Uekspedert",       bg: "#fee2e2", color: "#991b1b" },
    PROCESSING:       { label: "Behandles",        bg: "#fef3c7", color: "#92400e" },
    SHIPPED:          { label: "Sendt",            bg: "#dbeafe", color: "#1e40af" },
    READY_FOR_PICKUP: { label: "Klar for henting", bg: "#ede9fe", color: "#5b21b6" },
    COLLECTED:        { label: "Hentet",           bg: "#dcfce7", color: "#166534" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return <Badge {...s} />;
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.55rem",
        borderRadius: "4px",
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: source === "PHONE" ? "#ede9fe" : "#e0f2fe",
        color: source === "PHONE" ? "#6d28d9" : "#0369a1",
      }}
    >
      {source === "PHONE" ? "TLFL" : "WEB"}
    </span>
  );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}
