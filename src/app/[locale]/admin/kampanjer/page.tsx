import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import {
  togglePromotionFormAction,
  deletePromotionFormAction,
} from "@/app/actions/promotions";
import CreatePromotionForm from "./_CreatePromotionForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kampanjer — Admin" };

export default async function KampanjerPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const promotions = await prisma.promotion.findMany({
    orderBy: [{ isActive: "desc" }, { startsAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      discountType: true,
      discountValue: true,
      targetType: true,
      targetId: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      appliesToCustomerType: true,
      createdAt: true,
      createdBy: { select: { fullName: true } },
      _count: { select: { saleItems: true } },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Kampanjer
        </h1>
      </div>

      {/* Create form (client component) */}
      <CreatePromotionForm />

      {/* Promotions list */}
      {promotions.length === 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            padding: "3rem",
            textAlign: "center",
            color: "#94a3b8",
          }}
        >
          Ingen kampanjer enda. Klikk &quot;+ Ny kampanje&quot; for å opprette en.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {promotions.map((promo) => {
            const now = new Date();
            const started = promo.startsAt <= now;
            const ended = promo.endsAt <= now;
            const liveNow = promo.isActive && started && !ended;

            const toggleAction = togglePromotionFormAction.bind(null, promo.id, !promo.isActive);
            const deleteAction = deletePromotionFormAction.bind(null, promo.id);

            return (
              <div
                key={promo.id}
                style={{
                  background: "#fff",
                  borderRadius: "8px",
                  border: `1px solid ${liveNow ? "#86efac" : "#e2e8f0"}`,
                  padding: "1.25rem",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  alignItems: "start",
                }}
              >
                {/* Info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
                      {promo.name}
                    </span>
                    {liveNow && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: "#dcfce7",
                          color: "#166534",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                        }}
                      >
                        AKTIV NÅ
                      </span>
                    )}
                    {!promo.isActive && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: "#f1f5f9",
                          color: "#64748b",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                        }}
                      >
                        DEAKTIVERT
                      </span>
                    )}
                    {promo.isActive && ended && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: "#fef3c7",
                          color: "#92400e",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                        }}
                      >
                        UTLØPT
                      </span>
                    )}
                    {promo.isActive && !started && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: "#dbeafe",
                          color: "#1e40af",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                        }}
                      >
                        PLANLAGT
                      </span>
                    )}
                  </div>

                  {promo.description && (
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
                      {promo.description}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.8rem", color: "#475569" }}>
                    <span>
                      <strong>Rabatt:</strong>{" "}
                      {promo.discountType === "PERCENTAGE"
                        ? `${Number(promo.discountValue)}%`
                        : `${Number(promo.discountValue).toLocaleString("nb-NO")} NOK`}
                    </span>
                    <span>
                      <strong>Mål:</strong>{" "}
                      {targetTypeLabel(promo.targetType)} — <code style={{ fontSize: "0.75rem" }}>{promo.targetId}</code>
                    </span>
                    <span>
                      <strong>Gjelder:</strong> {audienceLabel(promo.appliesToCustomerType)}
                    </span>
                    <span>
                      <strong>Periode:</strong>{" "}
                      {promo.startsAt.toLocaleDateString("nb-NO")} –{" "}
                      {promo.endsAt.toLocaleDateString("nb-NO")}
                    </span>
                    <span>
                      <strong>Brukt:</strong> {promo._count.saleItems} gang(er)
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  {/* Toggle active */}
                  <form action={toggleAction}>
                    <button
                      type="submit"
                      style={{
                        padding: "0.45rem 0.875rem",
                        background: promo.isActive ? "#fef9c3" : "#dcfce7",
                        color: promo.isActive ? "#92400e" : "#166534",
                        border: "1px solid " + (promo.isActive ? "#fde68a" : "#86efac"),
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {promo.isActive ? "Deaktiver" : "Aktiver"}
                    </button>
                  </form>

                  {/* Delete */}
                  <form
                    action={deleteAction}
                    onSubmit={(e) => {
                      if (!confirm(`Slett kampanjen «${promo.name}»? Dette kan ikke angres.`)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <button
                      type="submit"
                      style={{
                        padding: "0.45rem 0.875rem",
                        background: "#fef2f2",
                        color: "#991b1b",
                        border: "1px solid #fecaca",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                      }}
                    >
                      Slett
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function targetTypeLabel(type: string): string {
  return { PRODUCT: "Produkt", CATEGORY: "Kategori", BRAND: "Merkevare" }[type] ?? type;
}

function audienceLabel(audience: string): string {
  return (
    { BOTH: "Alle", CONSUMER: "Forbrukere", BUSINESS: "Bedrifter" }[audience] ?? audience
  );
}
