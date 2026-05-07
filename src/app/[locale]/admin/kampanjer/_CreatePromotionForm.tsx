"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPromotionAction,
  type CreatePromotionData,
} from "@/app/actions/promotions";
import {
  DiscountType,
  PromotionTargetType,
  PromotionAudience,
} from "@/app/generated/prisma/enums";

export default function CreatePromotionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CreatePromotionData>({
    name: "",
    description: "",
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    targetType: PromotionTargetType.PRODUCT,
    targetId: "",
    startsAt: "",
    endsAt: "",
    appliesToCustomerType: PromotionAudience.BOTH,
  });

  function set<K extends keyof CreatePromotionData>(key: K, value: CreatePromotionData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPromotionAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setForm({
        name: "",
        description: "",
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        targetType: PromotionTargetType.PRODUCT,
        targetId: "",
        startsAt: "",
        endsAt: "",
        appliesToCustomerType: PromotionAudience.BOTH,
      });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "0.5rem 1.25rem",
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        + Ny kampanje
      </button>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
          Opprett ny kampanje
        </h2>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: "1.2rem" }}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
          {/* Name */}
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Navn *
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="f.eks. Sommerkampanje 2026"
              required
              style={inputStyle}
            />
          </label>

          {/* Description */}
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Beskrivelse (valgfri)
            <input
              type="text"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Kort beskrivelse av kampanjen"
              style={inputStyle}
            />
          </label>

          {/* Discount type */}
          <label style={labelStyle}>
            Rabatttype *
            <select
              value={form.discountType}
              onChange={(e) => set("discountType", e.target.value as DiscountType)}
              style={inputStyle}
            >
              <option value={DiscountType.PERCENTAGE}>Prosent (%)</option>
              <option value={DiscountType.FIXED_AMOUNT}>Fast beløp (NOK)</option>
            </select>
          </label>

          {/* Discount value */}
          <label style={labelStyle}>
            Rabattverdi *
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={form.discountValue}
              onChange={(e) => set("discountValue", parseFloat(e.target.value) || 0)}
              required
              style={inputStyle}
            />
          </label>

          {/* Target type */}
          <label style={labelStyle}>
            Måltype *
            <select
              value={form.targetType}
              onChange={(e) => set("targetType", e.target.value as PromotionTargetType)}
              style={inputStyle}
            >
              <option value={PromotionTargetType.PRODUCT}>Produkt (SKU)</option>
              <option value={PromotionTargetType.CATEGORY}>Kategori (slug)</option>
              <option value={PromotionTargetType.BRAND}>Merkevare</option>
            </select>
          </label>

          {/* Target ID */}
          <label style={labelStyle}>
            Mål-ID *
            <input
              type="text"
              value={form.targetId}
              onChange={(e) => set("targetId", e.target.value)}
              placeholder={
                form.targetType === PromotionTargetType.PRODUCT
                  ? "SKU-kode"
                  : form.targetType === PromotionTargetType.CATEGORY
                  ? "kategori-slug"
                  : "merkevarenavn"
              }
              required
              style={inputStyle}
            />
          </label>

          {/* Audience */}
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Gjelder for
            <select
              value={form.appliesToCustomerType}
              onChange={(e) => set("appliesToCustomerType", e.target.value as PromotionAudience)}
              style={inputStyle}
            >
              <option value={PromotionAudience.BOTH}>Alle kunder</option>
              <option value={PromotionAudience.CONSUMER}>Kun forbrukerkunder</option>
              <option value={PromotionAudience.BUSINESS}>Kun bedriftskunder</option>
            </select>
          </label>

          {/* Starts at */}
          <label style={labelStyle}>
            Startdato og -tid *
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
              required
              style={inputStyle}
            />
          </label>

          {/* Ends at */}
          <label style={labelStyle}>
            Sluttdato og -tid *
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
              required
              style={inputStyle}
            />
          </label>
        </div>

        {error && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              color: "#991b1b",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: "0.5rem 1.5rem",
              background: isPending ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
            }}
          >
            {isPending ? "Oppretter…" : "Opprett kampanje"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              padding: "0.5rem 1.25rem",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "#374151",
            }}
          >
            Avbryt
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#1e293b",
  background: "#fff",
};
