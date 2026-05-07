import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, ProductDraftStatus } from "@/app/generated/prisma/enums";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Produktforslag — Admin" };

const STATUS_LABEL: Record<ProductDraftStatus, string> = {
  PENDING:  "Venter",
  APPROVED: "Godkjent",
  REJECTED: "Avvist",
};

const STATUS_STYLE: Record<ProductDraftStatus, React.CSSProperties> = {
  PENDING:  { background: "#fef9c3", color: "#713f12", border: "1px solid #fde047" },
  APPROVED: { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
  REJECTED: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
};

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function ProduktforslagPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const params       = await searchParams;
  const statusFilter = params.status as ProductDraftStatus | undefined;

  const drafts = await prisma.productDraft.findMany({
    where:   statusFilter ? { status: statusFilter } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      reviewedBy: { select: { fullName: true } },
      requests:   { select: { id: true, email: true, status: true, createdAt: true } },
    },
    take: 100,
  });

  const counts = await prisma.productDraft.groupBy({
    by:     ["status"],
    _count: { _all: true },
  });
  const countMap: Record<string, number> = {};
  for (const r of counts) countMap[r.status] = r._count._all;

  const buildUrl = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    const q = p.toString();
    return `/admin/produktforslag${q ? "?" + q : ""}`;
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.25rem" }}>
        Produktforslag
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Ukjente koder som er scannet av kunder eller ansatte. Godkjenn for å opprette nytt produkt.
      </p>

      {/* ── Status filter ── */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {([undefined, "PENDING", "APPROVED", "REJECTED"] as const).map((s) => {
          const active = statusFilter === s;
          const label  = s ? STATUS_LABEL[s] : "Alle";
          const count  = s ? (countMap[s] ?? 0) : Object.values(countMap).reduce((a, b) => a + b, 0);
          return (
            <Link
              key={s ?? "all"}
              href={buildUrl(s)}
              style={{
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                fontSize: "0.775rem",
                fontWeight: 600,
                textDecoration: "none",
                background: active ? "#0f172a" : "#f1f5f9",
                color:      active ? "#fff"     : "#475569",
                border:     "1px solid " + (active ? "#0f172a" : "#e2e8f0"),
              }}
            >
              {label} ({count})
            </Link>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Scannet kode", "Foreslått navn", "Merke", "Forespørsler", "Status", "Opprettet", ""].map((h) => (
                <th key={h} style={{ padding: "0.6rem 0.875rem", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.6rem 0.875rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#334155" }}>
                  {d.scannedCode}
                </td>
                <td style={{ padding: "0.6rem 0.875rem", color: "#1e293b" }}>
                  {d.suggestedName ?? <span style={{ color: "#94a3b8" }}>—</span>}
                </td>
                <td style={{ padding: "0.6rem 0.875rem", color: "#64748b" }}>
                  {d.suggestedBrand ?? <span style={{ color: "#94a3b8" }}>—</span>}
                </td>
                <td style={{ padding: "0.6rem 0.875rem", textAlign: "center", color: "#475569" }}>
                  {d.requests.length}
                </td>
                <td style={{ padding: "0.6rem 0.875rem" }}>
                  <span style={{ padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 600, ...STATUS_STYLE[d.status] }}>
                    {STATUS_LABEL[d.status]}
                  </span>
                </td>
                <td style={{ padding: "0.6rem 0.875rem", color: "#64748b", whiteSpace: "nowrap" }}>
                  {d.createdAt.toLocaleDateString("nb-NO")}
                </td>
                <td style={{ padding: "0.6rem 0.875rem" }}>
                  <Link href={`/admin/produktforslag/${d.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "0.75rem" }}>
                    {d.status === "PENDING" ? "Behandle →" : "Se detaljer →"}
                  </Link>
                </td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                  Ingen produktforslag ennå.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
