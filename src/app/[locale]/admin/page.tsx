import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus, FulfillmentStatus } from "@/app/generated/prisma/enums";
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

    prisma.sale.aggregate({
      _sum: { totalPrice: true },
      where: { status: paidStatuses, createdAt: { gte: thisWeek } },
    }),
    prisma.sale.aggregate({
      _sum: { totalPrice: true },
      where: { status: paidStatuses, createdAt: { gte: thisMon } },
    }),
    prisma.sale.aggregate({
      _sum: { totalPrice: true },
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
  ]);

  const revToday = revTodayAgg._sum.totalPrice?.toNumber() ?? 0;
  const revWeek  = revWeekAgg._sum.totalPrice?.toNumber()  ?? 0;
  const revMonth = revMonAgg._sum.totalPrice?.toNumber()   ?? 0;

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

      {/* ── Stat cards — revenue ─────────────────────────────────────────────── */}
      <h2 style={{ ...sectionTitle, marginTop: "2rem" }}>Omsetning (betalte ordrer)</h2>
      <div style={gridStyle}>
        <RevenueCard label="I dag"     amount={kr(revToday)} color="#0ea5e9" />
        <RevenueCard label="Denne uka" amount={kr(revWeek)}  color="#6366f1" />
        <RevenueCard label="Denne mnd" amount={kr(revMonth)} color="#ec4899" />
      </div>

      {/* ── Recent orders ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={sectionTitle}>Siste ordrer</h2>
          <a href="/admin/ordrer" style={linkStyle}>Se alle →</a>
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
          <a href="/admin/revisjonslogg" style={linkStyle}>Se hele loggen →</a>
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
