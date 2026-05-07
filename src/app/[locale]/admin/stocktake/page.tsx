import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, StocktakeStatus } from "@/app/generated/prisma/enums";
import CreateSessionButton from "./_CreateSessionButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Varetelling — Admin" };

export default async function StocktakePage() {
  await requireRole(UserRole.FULFILLMENT_STAFF);

  const [stores, sessions] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.stocktakeSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        isBlind: true,
        startedAt: true,
        completedAt: true,
        store: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const STATUS_LABEL: Record<string, string> = {
    OPEN:           "Åpen",
    IN_PROGRESS:    "Pågår",
    PENDING_REVIEW: "Til gjennomgang",
    COMPLETED:      "Fullført",
  };
  const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    OPEN:           { bg: "#dbeafe", color: "#1e40af" },
    IN_PROGRESS:    { bg: "#fef9c3", color: "#92400e" },
    PENDING_REVIEW: { bg: "#ede9fe", color: "#5b21b6" },
    COMPLETED:      { bg: "#dcfce7", color: "#166534" },
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", marginBottom: "1.5rem" }}>
        Varetelling
      </h1>

      {/* ── Start new session ──────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.75rem" }}>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 1rem" }}>
          Start ny varetelling
        </h2>
        <CreateSessionButton stores={stores} />
      </div>

      {/* ── Session list ───────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Lager", "Startet", "Av", "Varer", "Blind", "Status", "Fullført", ""].map((h) => (
                <th key={h} style={{ padding: "0.625rem 1rem", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const st = s.status;
              const badge = STATUS_STYLE[st] ?? { bg: "#f1f5f9", color: "#475569" };
              const canOpen = st !== StocktakeStatus.COMPLETED;
              return (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.625rem 1rem", fontWeight: 600, color: "#1e293b" }}>
                    {s.store.name}
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#64748b", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                    {s.startedAt.toLocaleDateString("nb-NO")}
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#475569", fontSize: "0.8rem" }}>
                    {s.createdBy.fullName}
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#374151", textAlign: "right" }}>
                    {s._count.items}
                  </td>
                  <td style={{ padding: "0.625rem 1rem", textAlign: "center", color: s.isBlind ? "#7c3aed" : "#94a3b8" }}>
                    {s.isBlind ? "Blind" : "–"}
                  </td>
                  <td style={{ padding: "0.625rem 1rem" }}>
                    <span style={{ display: "inline-block", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: badge.bg, color: badge.color }}>
                      {STATUS_LABEL[st] ?? st}
                    </span>
                  </td>
                  <td style={{ padding: "0.625rem 1rem", color: "#64748b", fontSize: "0.8rem" }}>
                    {s.completedAt ? s.completedAt.toLocaleDateString("nb-NO") : "–"}
                  </td>
                  <td style={{ padding: "0.625rem 1rem" }}>
                    {canOpen && (
                      <Link href={`/admin/stocktake/${s.id}`} style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.8rem", fontWeight: 600 }}>
                        Åpne →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                  Ingen varetellinger enda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
