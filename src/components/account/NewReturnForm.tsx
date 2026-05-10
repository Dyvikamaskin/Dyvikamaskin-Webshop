"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReturnRequestAction } from "@/app/actions/returns";
import { ReturnReason } from "@/app/generated/prisma/enums";

const REASON_LABELS: Record<ReturnReason, string> = {
  WRONG_ITEM: "Feil vare levert",
  DEFECTIVE: "Defekt vare",
  NOT_AS_DESCRIBED: "Ikke som beskrevet i annonsen",
  DAMAGED_IN_TRANSIT: "Skadet under frakt",
  CHANGED_MIND: "Angrerett (§22 — 14 dager)",
  OTHER: "Annet (forklar nedenfor)",
};

interface ItemRow {
  saleItemId: string;
  sku: string;
  productName: string;
  maxQuantity: number;
}

interface Props {
  saleId: string;
  items: ItemRow[];
}

export function NewReturnForm({ saleId, items }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReturnReason>(ReturnReason.DEFECTIVE);
  const [notes, setNotes] = useState("");
  // saleItemId → quantity (0 means not returned)
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.saleItemId, 0])),
  );
  const [error, setError] = useState<string | null>(null);

  function setQty(id: string, raw: number) {
    const max = items.find((i) => i.saleItemId === id)?.maxQuantity ?? 0;
    setQtys((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, raw)) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const selected = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));
    if (selected.length === 0) {
      setError("Velg minst én vare med antall ≥ 1.");
      return;
    }
    startTransition(async () => {
      const result = await createReturnRequestAction({
        saleId,
        reason,
        notes: notes.trim() || undefined,
        items: selected,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/konto/retur");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <legend style={{ padding: "0 0.5rem", fontWeight: 600, fontSize: "0.875rem" }}>
          Varer å returnere
        </legend>
        {items.map((it) => (
          <div
            key={it.saleItemId}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0", borderTop: "1px solid #f1f5f9" }}
          >
            <div style={{ fontSize: "0.875rem" }}>
              <strong>{it.productName}</strong>
              <span style={{ color: "#64748b", marginLeft: "0.5rem" }}>{it.sku}</span>
              <span style={{ color: "#94a3b8", marginLeft: "0.5rem" }}>(maks {it.maxQuantity})</span>
            </div>
            <input
              type="number"
              min={0}
              max={it.maxQuantity}
              value={qtys[it.saleItemId] ?? 0}
              onChange={(e) => setQty(it.saleItemId, parseInt(e.target.value, 10) || 0)}
              style={{
                width: "5rem",
                padding: "0.35rem 0.5rem",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            />
          </div>
        ))}
      </fieldset>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="reason" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>
          Årsak
        </label>
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReturnReason)}
          style={{ width: "100%", padding: "0.55rem 0.75rem", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.9rem" }}
        >
          {(Object.keys(REASON_LABELS) as ReturnReason[]).map((r) => (
            <option key={r} value={r}>{REASON_LABELS[r]}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="notes" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>
          Beskrivelse (valgfritt)
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Beskriv defekten eller årsaken til retur."
          style={{ width: "100%", padding: "0.55rem 0.75rem", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.9rem", resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      {error ? (
        <p style={{ marginBottom: "0.875rem", color: "#dc2626", fontSize: "0.875rem" }}>{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.6rem 1.4rem",
          background: pending ? "#e2e8f0" : "#0f172a",
          color: pending ? "#94a3b8" : "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "0.9rem",
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Sender …" : "Send returforespørsel"}
      </button>
    </form>
  );
}
