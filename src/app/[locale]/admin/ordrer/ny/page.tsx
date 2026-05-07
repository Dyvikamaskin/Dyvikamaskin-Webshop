"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPhoneOrderAction } from "@/app/actions/phone-order";
import type { PhoneOrderItem } from "@/app/actions/phone-order";

export default function NyOrdre() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [customerEmail, setCustomerEmail] = useState("");
  const [isPickup, setIsPickup] = useState(false);
  const [dueDays, setDueDays] = useState(0);
  const [items, setItems] = useState<Array<{ sku: string; quantity: number }>>([
    { sku: "", quantity: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function addItem() {
    setItems((prev) => [...prev, { sku: "", quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof PhoneOrderItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validItems = items.filter((i) => i.sku.trim());
    if (!customerEmail.trim()) {
      setError("E-post er påkrevd.");
      return;
    }
    if (validItems.length === 0) {
      setError("Legg til minst én vare med SKU.");
      return;
    }

    startTransition(async () => {
      const result = await createPhoneOrderAction(
        customerEmail,
        validItems.map((i) => ({ sku: i.sku.trim(), quantity: Number(i.quantity) })),
        isPickup,
        dueDays
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(
        `Ordre opprettet! ${result.saleIds.length} delordre(r). Viderekobler til ordreoversikt…`
      );
      setTimeout(() => router.push("/admin/ordrer"), 1800);
    });
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "700px" }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1.25rem" }}>
        <Link href="/admin/ordrer" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Tilbake til ordrer
        </Link>
      </nav>

      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", marginBottom: "1.75rem" }}>
        Ny telefonordre
      </h1>

      <form onSubmit={handleSubmit}>
        {/* Customer */}
        <section style={sectionStyle}>
          <h2 style={sectionHeading}>Kunde</h2>
          <label style={labelStyle}>
            E-postadresse *
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="kunde@eksempel.no"
              required
              style={inputStyle}
            />
          </label>
        </section>

        {/* Delivery */}
        <section style={sectionStyle}>
          <h2 style={sectionHeading}>Levering og betaling</h2>

          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.875rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", color: "#374151" }}>
              <input
                type="checkbox"
                checked={isPickup}
                onChange={(e) => setIsPickup(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              Hentes i butikk
            </label>
          </div>

          <label style={labelStyle}>
            Betalingsfrist
            <select
              value={dueDays}
              onChange={(e) => setDueDays(Number(e.target.value))}
              style={inputStyle}
            >
              <option value={0}>Umiddelbar betaling</option>
              <option value={14}>14 dager netto</option>
              <option value={30}>30 dager netto</option>
            </select>
          </label>
        </section>

        {/* Items */}
        <section style={sectionStyle}>
          <h2 style={sectionHeading}>Varelinjer</h2>

          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-end",
                marginBottom: "0.75rem",
              }}
            >
              <label style={{ ...labelStyle, flex: 2 }}>
                {index === 0 && "SKU"}
                <input
                  type="text"
                  value={item.sku}
                  onChange={(e) => updateItem(index, "sku", e.target.value)}
                  placeholder="f.eks. BOLT-M8-50"
                  style={inputStyle}
                />
              </label>
              <label style={{ ...labelStyle, width: "100px" }}>
                {index === 0 && "Antall"}
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value, 10) || 1)}
                  style={inputStyle}
                />
              </label>
              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={items.length === 1}
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "none",
                  borderRadius: "6px",
                  cursor: items.length === 1 ? "not-allowed" : "pointer",
                  opacity: items.length === 1 ? 0.4 : 1,
                  marginBottom: "1px",
                }}
                title="Fjern vare"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            style={{
              padding: "0.45rem 1rem",
              background: "#f1f5f9",
              border: "1px dashed #94a3b8",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "#475569",
              marginTop: "0.25rem",
            }}
          >
            + Legg til vare
          </button>
        </section>

        {/* Feedback */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "0.75rem 1rem",
              color: "#991b1b",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              padding: "0.75rem 1rem",
              color: "#166534",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {success}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: "0.625rem 2rem",
            background: isPending ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Oppretter…" : "Opprett telefonordre"}
        </button>
      </form>
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  padding: "1.25rem",
  marginBottom: "1.25rem",
};

const sectionHeading: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 1rem",
};

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
