"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCustomerPriceAction,
  deleteCustomerPriceAction,
} from "@/app/actions/customer-prices";
import { CustomerPriceScope } from "@/app/generated/prisma/enums";

interface Tier {
  id: string;
  scope: CustomerPriceScope;
  scopeId: string | null;
  discountPercent: string | null;
  fixedPrice: string | null;
  notes: string | null;
}

interface Props {
  profileId: string;
  tiers: Tier[];
}

const SCOPE_LABELS: Record<CustomerPriceScope, string> = {
  GLOBAL: "Hele katalogen",
  CATEGORY: "Kategori",
  BRAND: "Merke (delens merke)",
  PRODUCT: "Produkt (SKU)",
};

export function CustomerPriceList({ profileId, tiers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<CustomerPriceScope>(CustomerPriceScope.GLOBAL);
  const [scopeId, setScopeId] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [fixedPrice, setFixedPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createCustomerPriceAction({
        profileId,
        scope,
        scopeId: scopeId || null,
        discountPercent: discountPercent ? parseFloat(discountPercent) : null,
        fixedPrice: fixedPrice ? parseFloat(fixedPrice) : null,
        notes: notes || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setScopeId("");
      setDiscountPercent("");
      setFixedPrice("");
      setNotes("");
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCustomerPriceAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1rem", fontWeight: 700 }}>
          Eksisterende pristier
        </h2>
        {tiers.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", margin: 0 }}>
            Ingen tier-regler. Standard rabatt brukes.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead style={{ color: "#64748b", fontSize: "0.75rem", textAlign: "left" }}>
              <tr>
                <th style={{ padding: "0.3rem 0" }}>Omfang</th>
                <th style={{ padding: "0.3rem 0" }}>Mål</th>
                <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Rabatt %</th>
                <th style={{ padding: "0.3rem 0", textAlign: "right" }}>Fastpris</th>
                <th style={{ padding: "0.3rem 0" }}>Notater</th>
                <th style={{ padding: "0.3rem 0" }}></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.4rem 0" }}>{SCOPE_LABELS[t.scope]}</td>
                  <td style={{ padding: "0.4rem 0", fontFamily: "monospace" }}>{t.scopeId ?? "—"}</td>
                  <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{t.discountPercent ? `${t.discountPercent}%` : "—"}</td>
                  <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{t.fixedPrice ? `${t.fixedPrice} kr` : "—"}</td>
                  <td style={{ padding: "0.4rem 0", color: "#475569" }}>{t.notes ?? ""}</td>
                  <td style={{ padding: "0.4rem 0", textAlign: "right" }}>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={pending}
                      style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "0.85rem" }}
                    >
                      Slett
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1rem", fontWeight: 700 }}>
          Legg til pristier
        </h2>
        <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label style={lblStyle}>Omfang</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as CustomerPriceScope)} style={input}>
              {(Object.keys(SCOPE_LABELS) as CustomerPriceScope[]).map((s) => (
                <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lblStyle}>Mål-ID / SKU / merke / kategori-ID</label>
            <input
              type="text"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              disabled={scope === "GLOBAL"}
              placeholder={scope === "GLOBAL" ? "Ikke nødvendig for GLOBAL" : "F.eks. Bosch, cat-verktoy, SKU-123"}
              style={input}
            />
          </div>
          <div>
            <label style={lblStyle}>Rabatt-prosent</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="0–100"
              style={input}
            />
          </div>
          <div>
            <label style={lblStyle}>… eller fastpris (kun PRODUKT)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={fixedPrice}
              onChange={(e) => setFixedPrice(e.target.value)}
              disabled={scope !== "PRODUCT"}
              placeholder="Pris per enhet (ekskl. MVA)"
              style={input}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lblStyle}>Notater (valgfritt)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="F.eks. avtalt 2026-01-15 med Hans hos Volvo"
              style={input}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <button type="submit" disabled={pending} style={{
              padding: "0.55rem 1.2rem",
              background: pending ? "#e2e8f0" : "#0f172a",
              color: pending ? "#94a3b8" : "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
            }}>
              {pending ? "Lagrer …" : "Lagre pristier"}
            </button>
            {error ? <span style={{ marginLeft: "0.75rem", color: "#dc2626", fontSize: "0.875rem" }}>{error}</span> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

const lblStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.3rem",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.875rem",
};
