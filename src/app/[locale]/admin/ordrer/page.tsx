import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus, FulfillmentStatus } from "@/app/generated/prisma/enums";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ordrer — Admin" };

const PAGE_SIZE = 20;

interface Props {
  searchParams: Promise<{
    status?: string;
    fulfillment?: string;
    q?: string;
    page?: string;
  }>;
}

export default async function OrdrerPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const params = await searchParams;
  const statusFilter = params.status as OrderStatus | undefined;
  const fulfillmentFilter = params.fulfillment as FulfillmentStatus | undefined;
  const query = params.q?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    ...(statusFilter && { status: statusFilter }),
    ...(fulfillmentFilter && { fulfillmentStatus: fulfillmentFilter }),
    ...(query && {
      OR: [
        { id: { contains: query, mode: "insensitive" as const } },
        { customer: { email: { contains: query, mode: "insensitive" as const } } },
        { customer: { fullName: { contains: query, mode: "insensitive" as const } } },
        { invoiceNumber: { contains: query, mode: "insensitive" as const } },
      ],
    }),
  };

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        status: true,
        fulfillmentStatus: true,
        totalPrice: true,
        orderSource: true,
        invoiceNumber: true,
        isPickup: true,
        customer: { select: { fullName: true, email: true } },
        store: { select: { name: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: statusFilter, fulfillment: fulfillmentFilter, q: query || undefined, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "undefined") p.set(k, v);
    }
    return `/admin/ordrer?${p.toString()}`;
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1300px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Ordrer
        </h1>
        <Link
          href="/admin/ordrer/ny"
          style={{
            background: "#2563eb",
            color: "#fff",
            padding: "0.5rem 1.25rem",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          + Telefonordre
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {/* Search */}
        <form method="get" action="/admin/ordrer">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {fulfillmentFilter && <input type="hidden" name="fulfillment" value={fulfillmentFilter} />}
          <input
            name="q"
            defaultValue={query}
            placeholder="Søk på ordre-ID, e-post…"
            style={{
              padding: "0.45rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.875rem",
              width: "240px",
            }}
          />
          <button
            type="submit"
            style={{
              marginLeft: "0.5rem",
              padding: "0.45rem 0.875rem",
              background: "#f1f5f9",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Søk
          </button>
        </form>

        {/* Status filter pills */}
        {[
          { label: "Alle", value: undefined },
          { label: "Venter", value: OrderStatus.PENDING },
          { label: "Betalt", value: OrderStatus.PAID },
          { label: "Fakturert", value: OrderStatus.INVOICED },
        ].map(({ label, value }) => (
          <Link
            key={label}
            href={buildUrl({ status: value, page: "1" })}
            style={{
              padding: "0.4rem 0.875rem",
              borderRadius: "999px",
              fontSize: "0.8rem",
              fontWeight: 600,
              textDecoration: "none",
              background: statusFilter === value ? "#2563eb" : "#f1f5f9",
              color: statusFilter === value ? "#fff" : "#475569",
              border: "1px solid " + (statusFilter === value ? "#2563eb" : "#e2e8f0"),
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          marginBottom: "1rem",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Ordre-ID", "Kunde", "Butikk", "Kilde", "Status", "Fullføring", "Totalt", "Dato", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "0.625rem 1rem",
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
            {sales.map((sale) => (
              <tr key={sale.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      color: "#334155",
                    }}
                  >
                    {sale.id.slice(0, 10)}
                  </span>
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <div style={{ fontSize: "0.875rem", color: "#1e293b" }}>
                    {sale.customer?.fullName ?? <em style={{ color: "#94a3b8" }}>Gjest</em>}
                  </div>
                  {sale.customer?.email && (
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {sale.customer.email}
                    </div>
                  )}
                </td>
                <td style={{ padding: "0.625rem 1rem", color: "#64748b", fontSize: "0.8rem" }}>
                  {sale.store.name}
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <SourceBadge source={sale.orderSource} />
                  {sale.isPickup && (
                    <span style={{ marginLeft: "0.35rem", fontSize: "0.7rem", color: "#7c3aed" }}>
                      🏪
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <StatusBadge status={sale.status} />
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <FulfillmentBadge status={sale.fulfillmentStatus} />
                </td>
                <td style={{ padding: "0.625rem 1rem", whiteSpace: "nowrap", color: "#1e293b" }}>
                  {Number(sale.totalPrice).toLocaleString("nb-NO", {
                    style: "currency",
                    currency: "NOK",
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td style={{ padding: "0.625rem 1rem", color: "#64748b", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                  {sale.createdAt.toLocaleDateString("nb-NO")}
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <Link
                    href={`/admin/ordrer/${sale.id}`}
                    style={{
                      color: "#2563eb",
                      textDecoration: "none",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    Detaljer →
                  </Link>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}
                >
                  Ingen ordrer funnet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Side {page} av {totalPages} ({total} ordrer)
          </span>
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              style={paginationLink}
            >
              ← Forrige
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              style={paginationLink}
            >
              Neste →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const paginationLink: React.CSSProperties = {
  padding: "0.4rem 0.875rem",
  background: "#f1f5f9",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  textDecoration: "none",
  color: "#374151",
  fontSize: "0.8rem",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Venter",    bg: "#fef9c3", color: "#854d0e" },
    PAID:     { label: "Betalt",    bg: "#dcfce7", color: "#166534" },
    INVOICED: { label: "Fakturert", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    UNFULFILLED:      { label: "Uekspedert",      bg: "#fee2e2", color: "#991b1b" },
    PROCESSING:       { label: "Behandles",       bg: "#fef3c7", color: "#92400e" },
    SHIPPED:          { label: "Sendt",           bg: "#dbeafe", color: "#1e40af" },
    READY_FOR_PICKUP: { label: "Klar for henting", bg: "#ede9fe", color: "#5b21b6" },
    COLLECTED:        { label: "Hentet",          bg: "#dcfce7", color: "#166534" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, background: source === "PHONE" ? "#ede9fe" : "#e0f2fe", color: source === "PHONE" ? "#6d28d9" : "#0369a1" }}>
      {source === "PHONE" ? "TLFL" : "WEB"}
    </span>
  );
}
