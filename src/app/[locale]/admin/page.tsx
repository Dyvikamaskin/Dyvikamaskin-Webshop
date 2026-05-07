import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus, FulfillmentStatus } from "@/app/generated/prisma/enums";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Oversikt — Admin" };

export default async function AdminDashboardPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [ordersToday, pendingOrders, unfulfilledOrders, activePromotions, totalCustomers] =
    await Promise.all([
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
    ]);

  // Latest 5 orders
  const recentOrders = await prisma.sale.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      status: true,
      fulfillmentStatus: true,
      totalPrice: true,
      orderSource: true,
      customer: { select: { fullName: true, email: true } },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px" }}>
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

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2.5rem",
        }}
      >
        <StatCard label="Ordrer i dag" value={ordersToday} color="#3b82f6" />
        <StatCard label="Ventende betaling" value={pendingOrders} color="#f59e0b" />
        <StatCard label="Uekspederte ordrer" value={unfulfilledOrders} color="#ef4444" />
        <StatCard label="Aktive kampanjer" value={activePromotions} color="#10b981" />
        <StatCard label="Kunder totalt" value={totalCustomers} color="#8b5cf6" />
      </div>

      {/* Recent orders */}
      <section>
        <h2
          style={{
            fontSize: "1.05rem",
            fontWeight: 600,
            color: "#1e293b",
            marginBottom: "0.75rem",
          }}
        >
          Siste ordrer
        </h2>
        <div
          style={{
            background: "#fff",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                {["Ordre-ID", "Kunde", "Kilde", "Status", "Fullføring", "Totalt", "Dato"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.625rem 1rem",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((sale) => (
                <tr
                  key={sale.id}
                  style={{ borderTop: "1px solid #f1f5f9" }}
                >
                  <td style={{ padding: "0.625rem 1rem" }}>
                    <a
                      href={`/admin/ordrer/${sale.id}`}
                      style={{ color: "#2563eb", textDecoration: "none", fontFamily: "monospace", fontSize: "0.8rem" }}
                    >
                      {sale.id.slice(0, 8)}…
                    </a>
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#374151" }}>
                    {sale.customer?.fullName ?? <em style={{ color: "#94a3b8" }}>Gjest</em>}
                  </td>
                  <td style={{ padding: "0.625rem 1rem" }}>
                    <SourceBadge source={sale.orderSource} />
                  </td>
                  <td style={{ padding: "0.625rem 1rem" }}>
                    <StatusBadge status={sale.status} />
                  </td>
                  <td style={{ padding: "0.625rem 1rem" }}>
                    <FulfillmentBadge status={sale.fulfillmentStatus} />
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#374151", whiteSpace: "nowrap" }}>
                    {Number(sale.totalPrice).toLocaleString("nb-NO", {
                      style: "currency",
                      currency: "NOK",
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#64748b", whiteSpace: "nowrap" }}>
                    {sale.createdAt.toLocaleDateString("nb-NO")}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}
                  >
                    Ingen ordrer enda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
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
      <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "#0f172a" }}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Venter",   bg: "#fef9c3", color: "#854d0e" },
    PAID:     { label: "Betalt",   bg: "#dcfce7", color: "#166534" },
    INVOICED: { label: "Fakturert", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    UNFULFILLED:      { label: "Uekspedert",     bg: "#fee2e2", color: "#991b1b" },
    PROCESSING:       { label: "Behandles",      bg: "#fef3c7", color: "#92400e" },
    SHIPPED:          { label: "Sendt",          bg: "#dbeafe", color: "#1e40af" },
    READY_FOR_PICKUP: { label: "Klar for henting", bg: "#ede9fe", color: "#5b21b6" },
    COLLECTED:        { label: "Hentet",         bg: "#dcfce7", color: "#166534" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
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
