"use client";

import { useState, useRef } from "react";
import { updateReplacesPartNumbersAction } from "@/app/actions/product";

interface Props {
  sku:     string;
  initial: string[];
}

export default function ReplacesPartNumbersSection({ sku, initial }: Props) {
  const [items,   setItems]   = useState<string[]>(initial);
  const [input,   setInput]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Persist helper ───────────────────────────────────────────────
  async function persist(next: string[]) {
    setSaving(true);
    setError(null);
    const res = await updateReplacesPartNumbersAction(sku, next);
    setSaving(false);
    if (!res.ok) setError(res.error ?? "Noe gikk galt.");
  }

  // ── Add ──────────────────────────────────────────────────────────
  async function handleAdd() {
    const val = input.trim();
    if (!val) return;
    if (items.includes(val)) {
      setInput("");
      return;
    }
    const next = [...items, val];
    setItems(next);
    setInput("");
    await persist(next);
    inputRef.current?.focus();
  }

  // ── Remove ───────────────────────────────────────────────────────
  async function handleRemove(pn: string) {
    const next = items.filter((x) => x !== pn);
    setItems(next);
    await persist(next);
  }

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1.25rem 1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <h2
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "0 0 0.75rem",
        }}
      >
        Erstatter delenummer
      </h2>

      <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 0.9rem" }}>
        Legg til eldre delenumre som dette produktet erstatter.
      </p>

      {/* Tag list */}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
            marginBottom: "0.75rem",
          }}
        >
          {items.map((pn) => (
            <span
              key={pn}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                padding: "0.2rem 0.5rem",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                color: "#0f172a",
              }}
            >
              {pn}
              <button
                onClick={() => handleRemove(pn)}
                disabled={saving}
                aria-label={`Fjern ${pn}`}
                style={{
                  background: "none",
                  border: "none",
                  cursor: saving ? "default" : "pointer",
                  padding: "0 0.1rem",
                  color: "#94a3b8",
                  fontSize: "0.9rem",
                  lineHeight: 1,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add input */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          placeholder="Skriv inn delenummer og trykk Enter…"
          disabled={saving}
          style={{
            flex: 1,
            padding: "0.4rem 0.65rem",
            border: "1px solid #e2e8f0",
            borderRadius: "5px",
            fontSize: "0.875rem",
            fontFamily: "monospace",
            color: "#0f172a",
            background: saving ? "#f8fafc" : "#fff",
            outline: "none",
          }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !input.trim()}
          style={{
            padding: "0.4rem 0.85rem",
            background: saving || !input.trim() ? "#e2e8f0" : "#0f172a",
            color: saving || !input.trim() ? "#94a3b8" : "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: saving || !input.trim() ? "default" : "pointer",
            fontSize: "0.8rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Lagrer…" : "+ Legg til"}
        </button>
      </div>

      {error && (
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            color: "#dc2626",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
