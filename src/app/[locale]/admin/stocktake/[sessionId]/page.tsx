import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, StocktakeStatus } from "@/app/generated/prisma/enums";
import { advanceToReviewFormAction, finaliseStocktakeFormAction } from "@/app/actions/stocktake";
import ScannerPanel, { type SessionItem } from "./_ScannerPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Varetelling — skanning" };

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function StocktakeSessionPage({ params }: Props) {
  await requireRole(UserRole.FULFILLMENT_STAFF);

  const { sessionId } = await params;

  const session = await prisma.stocktakeSession.findUnique({
    where: { id: sessionId },
    include: {
      store: { select: { id: true, name: true } },
      createdBy: { select: { fullName: true } },
      items: {
        include: {
          product: { select: { sku: true, partNumber: true, name: true } },
        },
        orderBy: { product: { sku: "asc" } },
      },
    },
  });

  if (!session) notFound();

  // Load location codes for all products in this store
  const stockLines = await prisma.storeStock.findMany({
    where: {
      storeId:   session.store.id,
      productId: { in: session.items.map((i) => i.productId) },
    },
    select: { productId: true, locationCode: true },
  });
  const locationByProductId = new Map(stockLines.map((s) => [s.productId, s.locationCode]));

  // Build session items sorted by location code
  const sessionItems: SessionItem[] = session.items
    .map((item) => ({
      id:               item.id,
      productId:        item.productId,
      sku:              item.product.sku,
      partNumber:       item.product.partNumber,
      productName:      item.product.name,
      locationCode:     locationByProductId.get(item.productId) ?? null,
      expectedQuantity: item.expectedQuantity,
      countedQuantity:  item.countedQuantity,
      discrepancy:      item.discrepancy,
      // "isScanned" = counted was explicitly set (we detect via countedQuantity > 0 OR discrepancy === 0 with non-zero expected)
      // More reliable: track via scannedAt. If the timestamp was set after session start = scanned.
      isScanned:        item.scannedAt > session.startedAt,
    }))
    .sort((a, b) => {
      if (!a.locationCode && !b.locationCode) return a.sku.localeCompare(b.sku);
      if (!a.locationCode) return 1;
      if (!b.locationCode) return -1;
      return a.locationCode.localeCompare(b.locationCode);
    });

  const scannedCount  = sessionItems.filter((i) => i.isScanned).length;
  const isCompleted   = session.status === StocktakeStatus.COMPLETED;
  const isPending     = session.status === StocktakeStatus.PENDING_REVIEW;
  const isEditable    = !isCompleted && !isPending;

  const advanceAction  = advanceToReviewFormAction.bind(null, sessionId);
  const finaliseAction = finaliseStocktakeFormAction.bind(null, sessionId);

  const STATUS_LABEL: Record<string, string> = {
    OPEN: "Åpen", IN_PROGRESS: "Pågår", PENDING_REVIEW: "Til gjennomgang", COMPLETED: "Fullført",
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px" }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1.25rem" }}>
        <Link href="/admin/stocktake" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Tilbake til varetellinger
        </Link>
      </nav>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Varetelling — {session.store.name}
        </h1>
        <StatusBadge status={session.status} />
        {session.isBlind && (
          <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "#ede9fe", color: "#5b21b6", padding: "0.2rem 0.6rem", borderRadius: "999px" }}>
            BLIND
          </span>
        )}
        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
          Startet: {session.startedAt.toLocaleString("nb-NO")} av {session.createdBy.fullName}
        </span>
      </div>

      {/* Management actions */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {/* Advance to review */}
        {(session.status === StocktakeStatus.IN_PROGRESS || session.status === StocktakeStatus.OPEN) && (
          <form action={advanceAction}>
            <button
              type="submit"
              style={{ padding: "0.5rem 1.25rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}
            >
              ✅ Ferdig med skanning — send til gjennomgang
            </button>
          </form>
        )}

        {/* Finalise */}
        {session.status === StocktakeStatus.PENDING_REVIEW && (
          <form action={finaliseAction} onSubmit={(e) => {
            if (!confirm("Godkjenne varetelling og oppdatere lagerbeholdning?")) e.preventDefault();
          }}>
            <button
              type="submit"
              style={{ padding: "0.5rem 1.25rem", background: "#166534", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}
            >
              🏁 Godkjenn og oppdater beholdning
            </button>
          </form>
        )}

        {isCompleted && session.completedAt && (
          <span style={{ fontSize: "0.875rem", color: "#166534", fontWeight: 600 }}>
            ✓ Fullført {session.completedAt.toLocaleString("nb-NO")}
          </span>
        )}
      </div>

      {/* Discrepancy summary (only shown in PENDING_REVIEW / COMPLETED) */}
      {(isPending || isCompleted) && (
        <DiscrepancySummary items={sessionItems} />
      )}

      {/* Scanner panel (only in editable states) */}
      {isEditable ? (
        <ScannerPanel
          sessionId={sessionId}
          isBlind={session.isBlind}
          items={sessionItems}
        />
      ) : (
        /* Read-only table for review/completed */
        <ReadOnlyTable items={sessionItems} isBlind={session.isBlind} />
      )}
    </div>
  );
}

// ─── Read-only table ─────────────────────────────────────────────────────────

function ReadOnlyTable({ items, isBlind }: { items: SessionItem[]; isBlind: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Lokasjon", "SKU", "Produkt", ...(isBlind ? [] : ["Forventet"]), "Talt", "Avvik"].map((h) => (
              <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: h === "Forventet" || h === "Talt" || h === "Avvik" ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const hasDisc = item.isScanned && item.discrepancy !== 0;
            return (
              <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", background: hasDisc ? "#fff7ed" : "#fff" }}>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  {item.locationCode ? (
                    <code style={{ fontSize: "0.75rem", background: "#f0fdf4", color: "#166534", padding: "0.1rem 0.35rem", borderRadius: "3px" }}>{item.locationCode}</code>
                  ) : <span style={{ color: "#94a3b8" }}>–</span>}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.75rem" }}>{item.sku}</td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#1e293b" }}>{item.productName}</td>
                {!isBlind && <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#64748b" }}>{item.expectedQuantity}</td>}
                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700 }}>{item.countedQuantity}</td>
                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700, color: hasDisc ? (item.discrepancy > 0 ? "#2563eb" : "#dc2626") : "#166534" }}>
                  {item.discrepancy === 0 ? "✓" : (item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Discrepancy summary ──────────────────────────────────────────────────────

function DiscrepancySummary({ items }: { items: SessionItem[] }) {
  const diffs = items.filter((i) => i.discrepancy !== 0);
  if (diffs.length === 0) {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.5rem", color: "#166534", fontWeight: 600 }}>
        ✓ Ingen avvik funnet — alle telleresultater stemmer med forventet beholdning.
      </div>
    );
  }
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
      <p style={{ margin: "0 0 0.75rem", fontWeight: 700, color: "#92400e" }}>
        ⚠ {diffs.length} avvik funnet
      </p>
      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
        {diffs.map((item) => (
          <div key={item.id} style={{ fontSize: "0.8rem" }}>
            <span style={{ fontFamily: "monospace", color: "#0f172a" }}>{item.sku}</span>
            {item.locationCode && <span style={{ color: "#64748b" }}> ({item.locationCode})</span>}:
            {" "}<span style={{ color: item.discrepancy > 0 ? "#2563eb" : "#dc2626", fontWeight: 700 }}>
              {item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    OPEN:           { label: "Åpen",              bg: "#dbeafe", color: "#1e40af" },
    IN_PROGRESS:    { label: "Pågår",             bg: "#fef9c3", color: "#92400e" },
    PENDING_REVIEW: { label: "Til gjennomgang",   bg: "#ede9fe", color: "#5b21b6" },
    COMPLETED:      { label: "Fullført",          bg: "#dcfce7", color: "#166534" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.7rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
