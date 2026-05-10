"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestQuoteAction } from "@/app/actions/quotes";

interface QuoteLine {
  sku: string;
  quantity: number;
  productLabel?: string;
}

interface Props {
  stores: { id: string; name: string }[];
  defaultSku: string;
  defaultProductLabel: string;
  defaultQuantity: number;
}

export function RequestQuoteForm({ stores, defaultSku, defaultProductLabel, defaultQuantity }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [lines, setLines] = useState<QuoteLine[]>(
    defaultSku
      ? [{ sku: defaultSku, quantity: defaultQuantity, productLabel: defaultProductLabel }]
      : [{ sku: "", quantity: 1 }],
  );
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { sku: "", quantity: 1 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validLines = lines.filter((l) => l.sku.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      setError("Legg til minst én vare.");
      return;
    }
    if (!storeId) {
      setError("Velg en butikk.");
      return;
    }
    startTransition(async () => {
      const r = await requestQuoteAction({
        customerEmail: email,
        customerName: name || undefined,
        customerCompany: company || undefined,
        notes: notes || undefined,
        storeId,
        items: validLines.map((l) => ({ sku: l.sku.trim(), quantity: l.quantity })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmation(r.quoteNumber);
      // Reset form
      setLines([{ sku: "", quantity: 1 }]);
      setEmail("");
      setName("");
      setCompany("");
      setNotes("");
      router.refresh();
    });
  }

  if (confirmation) {
    return (
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "8px",
          padding: "1.25rem",
          color: "#166534",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: "1.05rem", fontWeight: 700 }}>
          Takk! Forespørselen er sendt.
        </h2>
        <p style={{ margin: "0.4rem 0" }}>
          Vi har mottatt tilbudsforespørsel{" "}
          <strong style={{ fontFamily: "monospace" }}>{confirmation}</strong>.
          Du hører fra oss innen 1–2 virkedager.
        </p>
        <button
          onClick={() => setConfirmation(null)}
          style={{
            marginTop: "0.5rem",
            background: "transparent",
            border: "1px solid #86efac",
            borderRadius: "6px",
            padding: "0.4rem 0.8rem",
            color: "#166534",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Send en til
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.5rem" }}>
      <fieldset style={{ border: 0, padding: 0, marginBottom: "1.25rem" }}>
        <legend style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.6rem" }}>
          Kontaktinformasjon
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <input
            type="email"
            required
            placeholder="E-post *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
          <input
            type="text"
            placeholder="Navn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={input}
          />
          <input
            type="text"
            placeholder="Selskap (valgfritt)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            style={{ ...input, gridColumn: "span 2" }}
          />
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, marginBottom: "1.25rem" }}>
        <legend style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.6rem" }}>
          Varer
        </legend>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input
              type="text"
              required
              placeholder="SKU (varenr.)"
              value={l.sku}
              onChange={(e) => updateLine(i, { sku: e.target.value })}
              style={{ ...input, flex: 2, fontFamily: "monospace" }}
            />
            <input
              type="number"
              min={1}
              value={l.quantity}
              onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value, 10) || 1 })}
              style={{ ...input, width: "5rem" }}
            />
            {lines.length > 1 ? (
              <button
                type="button"
                onClick={() => removeLine(i)}
                style={{
                  background: "transparent",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "0 0.6rem",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button type="button" onClick={addLine} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer" }}>
          + Legg til vare
        </button>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, marginBottom: "1.25rem" }}>
        <legend style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.6rem" }}>
          Behandlende butikk
        </legend>
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...input, width: "100%" }}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </fieldset>

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "block", fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
          Notater (valgfritt)
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Leveringssted, ønsket leveringstid, andre spesifikasjoner …"
          style={{ ...input, width: "100%", fontFamily: "inherit", resize: "vertical" }}
        />
      </div>

      {error ? <p style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.875rem" }}>{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.65rem 1.5rem",
          background: pending ? "#e2e8f0" : "#0f172a",
          color: pending ? "#94a3b8" : "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "0.95rem",
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Sender …" : "Send forespørsel"}
      </button>
    </form>
  );
}

const input: React.CSSProperties = {
  padding: "0.55rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "#fff",
};
