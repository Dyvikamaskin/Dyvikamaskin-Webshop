import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kunder — Admin" };

const PAGE_SIZE = 25;

interface Props {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}

export default async function KunderPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const typeFilter = params.type; // "CONSUMER" | "BUSINESS"
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    role: null, // only customers (not staff)
    ...(typeFilter && { customerType: typeFilter as "CONSUMER" | "BUSINESS" }),
    ...(query && {
      OR: [
        { email: { contains: query, mode: "insensitive" as const } },
        { fullName: { contains: query, mode: "insensitive" as const } },
        { companyName: { contains: query, mode: "insensitive" as const } },
        { orgNumber: { contains: query, mode: "insensitive" as const } },
      ],
    }),
  };

  const [customers, total] = await Promise.all([
    prisma.profile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        companyName: true,
        customerType: true,
        defaultDiscount: true,
        isApprovedForInvoice: true,
        isActive: true,
        createdAt: true,
        _count: { select: { salesAsCustomer: true } },
      },
    }),
    prisma.profile.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: query || undefined, type: typeFilter, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "undefined") p.set(k, v);
    }
    return `/admin/kunder?${p.toString()}`;
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", marginBottom: "1.5rem" }}>
        Kunder
      </h1>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {/* Search form */}
        <form method="get" action="/admin/kunder" style={{ display: "flex", gap: "0.5rem" }}>
          {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
          <input
            name="q"
            defaultValue={query}
            placeholder="Søk på navn, e-post, org.nr…"
            style={{
              padding: "0.45rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.875rem",
              width: "260px",
            }}
          />
          <button
            type="submit"
            style={{
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

        {/* Type filter pills */}
        {[
          { label: "Alle", value: undefined },
          { label: "Forbruker", value: "CONSUMER" },
          { label: "Bedrift", value: "BUSINESS" },
        ].map(({ label, value }) => (
          <Link
            key={label}
            href={buildUrl({ type: value, page: "1" })}
            style={{
              padding: "0.4rem 0.875rem",
              borderRadius: "999px",
              fontSize: "0.8rem",
              fontWeight: 600,
              textDecoration: "none",
              background: typeFilter === value ? "#2563eb" : "#f1f5f9",
              color: typeFilter === value ? "#fff" : "#475569",
              border: "1px solid " + (typeFilter === value ? "#2563eb" : "#e2e8f0"),
            }}
          >
            {label}
          </Link>
        ))}

        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "#64748b" }}>
          {total} kunder totalt
        </span>
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
              {["Navn", "E-post", "Type", "Rabatt", "Faktura", "Ordrer", "Opprettet", "Status", ""].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.625rem 1rem",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "#475569",
                      borderBottom: "1px solid #e2e8f0",
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
            {customers.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{c.fullName}</div>
                  {c.companyName && (
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{c.companyName}</div>
                  )}
                </td>
                <td style={{ padding: "0.625rem 1rem", color: "#374151" }}>{c.email}</td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <TypeBadge type={c.customerType} />
                </td>
                <td style={{ padding: "0.625rem 1rem", color: "#374151" }}>
                  {Number(c.defaultDiscount) > 0
                    ? `${Number(c.defaultDiscount).toFixed(0)}%`
                    : "–"}
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  {c.isApprovedForInvoice ? (
                    <span style={{ color: "#166534", fontWeight: 600 }}>✓</span>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>–</span>
                  )}
                </td>
                <td style={{ padding: "0.625rem 1rem", color: "#374151", textAlign: "right" }}>
                  {c._count.salesAsCustomer}
                </td>
                <td style={{ padding: "0.625rem 1rem", color: "#64748b", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                  {c.createdAt.toLocaleDateString("nb-NO")}
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  {c.isActive ? (
                    <span style={{ color: "#166534", fontSize: "0.75rem", fontWeight: 600 }}>Aktiv</span>
                  ) : (
                    <span style={{ color: "#dc2626", fontSize: "0.75rem", fontWeight: 600 }}>Inaktiv</span>
                  )}
                </td>
                <td style={{ padding: "0.625rem 1rem" }}>
                  <Link
                    href={`/admin/kunder/${c.id}`}
                    style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    Rediger →
                  </Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                  Ingen kunder funnet.
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
            Side {page} av {totalPages}
          </span>
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })} style={paginationLink}>
              ← Forrige
            </Link>
          )}
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })} style={paginationLink}>
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

function TypeBadge({ type }: { type: string }) {
  const isBusiness = type === "BUSINESS";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: isBusiness ? "#dbeafe" : "#f0fdf4",
        color: isBusiness ? "#1e40af" : "#166534",
      }}
    >
      {isBusiness ? "Bedrift" : "Forbruker"}
    </span>
  );
}
