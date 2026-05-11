import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import ApproveForm from "./_ApproveForm";
import RejectForm from "./_RejectForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Behandle produktforslag — Admin" };

interface Props {
  params: Promise<{ draftId: string }>;
}

export default async function DraftDetailPage({ params }: Props) {
  await requireRole(UserRole.STORE_MANAGER);
  const { draftId } = await params;

  const draft = await prisma.productDraft.findUnique({
    where:   { id: draftId },
    include: {
      reviewedBy: { select: { fullName: true } },
      requests: {
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, notes: true, status: true, createdAt: true },
      },
    },
  });

  if (!draft) notFound();

  const categories = await prisma.category.findMany({
    orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }],
    select:  { id: true, name: true, parentId: true },
  });

   
  const sources: Array<{ source: string; field: string; value: string }> =
    Array.isArray(draft.sources) ? (draft.sources as any[]) : [];

  const isPending = draft.status === "PENDING";

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <Link href="/admin/produktforslag" style={{ color: "#64748b", fontSize: "0.85rem", textDecoration: "none" }}>
        ← Tilbake til produktforslag
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Produktforslag
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#64748b" }}>
            Scannet kode: <code style={{ background: "#f1f5f9", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{draft.scannedCode}</code>
          </p>
        </div>
        <StatusBadge status={draft.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* ── Enrichment summary ── */}
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.75rem" }}>
            Berikede data
          </h2>
          {draft.suggestedImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.suggestedImage}
              alt="Foreslått produktbilde"
              style={{ maxWidth: "100%", maxHeight: "140px", objectFit: "contain", marginBottom: "0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}
            />
          )}
          <Field label="Navn"  value={draft.suggestedName} />
          <Field label="Merke" value={draft.suggestedBrand} />
          <Field label="Beskrivelse" value={draft.suggestedDesc} multiline />
        </section>

        {/* ── Source provenance ── */}
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.75rem" }}>
            Datakilder
          </h2>
          {sources.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Ingen data funnet fra eksterne kilder.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Kilde</th>
                  <th style={thStyle}>Felt</th>
                  <th style={thStyle}>Verdi</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={tdStyle}><code style={{ fontSize: "0.7rem" }}>{s.source}</code></td>
                    <td style={tdStyle}>{s.field}</td>
                    <td style={tdStyle} title={s.value}>{s.value.slice(0, 80)}{s.value.length > 80 ? "…" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── Customer requests ── */}
      {draft.requests.length > 0 && (
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.75rem" }}>
            Forespørsler ({draft.requests.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>E-post</th>
                <th style={thStyle}>Notat</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Dato</th>
              </tr>
            </thead>
            <tbody>
              {draft.requests.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>{r.email ?? <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td style={tdStyle}>{r.notes ?? "—"}</td>
                  <td style={tdStyle}>{r.status}</td>
                  <td style={tdStyle}>{r.createdAt.toLocaleDateString("nb-NO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Review forms ── */}
      {isPending ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <ApproveForm
            draftId={draft.id}
            initialSku={draft.scannedCode}
            initialName={draft.suggestedName ?? ""}
            initialBrand={draft.suggestedBrand ?? ""}
            initialDesc={draft.suggestedDesc ?? ""}
            categories={categories}
          />
          <RejectForm draftId={draft.id} />
        </div>
      ) : (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.25rem" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b" }}>
            Behandlet av <strong>{draft.reviewedBy?.fullName ?? "ukjent"}</strong>{" "}
            {draft.reviewedAt?.toLocaleString("nb-NO")}.
            {draft.notes && <span> Notat: {draft.notes}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <p style={{ margin: "0.15rem 0 0", fontSize: "0.825rem", color: value ? "#1e293b" : "#94a3b8",
        whiteSpace: multiline ? "pre-wrap" : undefined }}>
        {value || "—"}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    PENDING:  { background: "#fef9c3", color: "#713f12", border: "1px solid #fde047" },
    APPROVED: { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
    REJECTED: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
  };
  const labels: Record<string, string> = { PENDING: "Venter", APPROVED: "Godkjent", REJECTED: "Avvist" };
  return (
    <span style={{ padding: "0.3rem 0.8rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 700, ...(styles[status] ?? {}) }}>
      {labels[status] ?? status}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#475569",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "0.45rem 0.75rem",
  color: "#374151",
  verticalAlign: "top",
};
