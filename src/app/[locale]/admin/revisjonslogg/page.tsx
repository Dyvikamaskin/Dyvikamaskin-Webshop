import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { FilterForm } from "./_FilterForm";
import { DiffCell } from "./_DiffCell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Revisjonslogg — Admin" };

const PAGE_SIZE = 25;

interface Props {
  searchParams: {
    page?: string;
    action?: string;
    targetType?: string;
    from?: string;
    to?: string;
  };
}

export default async function RevisjonsloggPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const pageNum    = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const actionQ    = searchParams.action?.trim()     ?? "";
  const targetType = searchParams.targetType?.trim() ?? "";
  const from       = searchParams.from ?? "";
  const to         = searchParams.to   ?? "";

  const where = {
    ...(actionQ    ? { action: { contains: actionQ, mode: "insensitive" as const } } : {}),
    ...(targetType ? { targetType } : {}),
    ...((from || to) ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
      },
    } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:  (pageNum - 1) * PAGE_SIZE,
      take:  PAGE_SIZE,
      select: {
        id:            true,
        action:        true,
        targetType:    true,
        targetId:      true,
        previousValue: true,
        newValue:      true,
        createdAt:     true,
        actor: { select: { fullName: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (actionQ)    params.set("action", actionQ);
    if (targetType) params.set("targetType", targetType);
    if (from)       params.set("from", from);
    if (to)         params.set("to", to);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Revisjonslogg
        </h1>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          {total.toLocaleString("nb-NO")} oppføringer
        </span>
      </div>

      {/* Filters (client component) */}
      <FilterForm />

      {/* Table */}
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
              {["Tidspunkt", "Aktør", "Hendelse", "Måltype", "Mål-ID", "Endring"].map((h) => (
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
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td
                  style={{
                    padding: "0.75rem 1rem",
                    color: "#64748b",
                    whiteSpace: "nowrap",
                    fontSize: "0.8rem",
                  }}
                >
                  {e.createdAt.toLocaleString("nb-NO")}
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ fontWeight: 500, color: "#1e293b" }}>{e.actor.fullName}</div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{e.actor.email}</div>
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <code
                    style={{
                      fontSize: "0.75rem",
                      background: "#f1f5f9",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.action}
                  </code>
                </td>
                <td style={{ padding: "0.75rem 1rem", color: "#374151" }}>{e.targetType}</td>
                <td
                  style={{
                    padding: "0.75rem 1rem",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    color: "#64748b",
                  }}
                >
                  {e.targetId.slice(0, 12)}…
                </td>
                <td style={{ padding: "0.75rem 1rem", minWidth: "120px" }}>
                  <DiffCell prev={e.previousValue} next={e.newValue} />
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}
                >
                  Ingen oppføringer matcher filteret.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "1.5rem",
          }}
        >
          {pageNum > 1 && (
            <a href={buildPageUrl(pageNum - 1)} style={pageBtn}>← Forrige</a>
          )}

          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = totalPages <= 7
              ? i + 1
              : pageNum <= 4
              ? i + 1
              : pageNum >= totalPages - 3
              ? totalPages - 6 + i
              : pageNum - 3 + i;
            return (
              <a
                key={p}
                href={buildPageUrl(p)}
                style={{
                  ...pageBtn,
                  background: p === pageNum ? "#1e40af" : "#f8fafc",
                  color:      p === pageNum ? "#fff"    : "#374151",
                  fontWeight: p === pageNum ? 700       : 400,
                }}
              >
                {p}
              </a>
            );
          })}

          {pageNum < totalPages && (
            <a href={buildPageUrl(pageNum + 1)} style={pageBtn}>Neste →</a>
          )}

          <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#64748b" }}>
            Side {pageNum} av {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

const pageBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "0.4rem 0.75rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  color: "#374151",
  textDecoration: "none",
  fontSize: "0.875rem",
};
