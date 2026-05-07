"use client";

import { useState, useTransition } from "react";
import { updateStoreCutoffsAction } from "@/app/actions/fulfillment";

interface Props {
  storeId:            string;
  initialMorgen:      string;
  initialEttermiddag: string;
}

export default function CutoffForm({ storeId, initialMorgen, initialEttermiddag }: Props) {
  const [isPending,    startTransition] = useTransition();
  const [morgen,       setMorgen]       = useState(initialMorgen);
  const [ettermiddag,  setEttermiddag]  = useState(initialEttermiddag);
  const [feedback,     setFeedback]     = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await updateStoreCutoffsAction(storeId, morgen, ettermiddag);
      setFeedback(
        result.ok
          ? { ok: true,  msg: "✓ Kuttetider lagret." }
          : { ok: false, msg: result.error }
      );
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Morgenbatch kuttetid
          <input
            type="time"
            value={morgen}
            onChange={(e) => setMorgen(e.target.value)}
            required
            style={inputStyle}
          />
          <span style={hintStyle}>Ordrer før denne tid → morgenbatch</span>
        </label>

        <label style={labelStyle}>
          Ettermiddagsbatch kuttetid
          <input
            type="time"
            value={ettermiddag}
            onChange={(e) => setEttermiddag(e.target.value)}
            required
            style={inputStyle}
          />
          <span style={hintStyle}>Ordrer mellom morgen og denne tid → ettermiddagsbatch</span>
        </label>

        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: "0.5rem 1.25rem",
            background: isPending ? "#93c5fd" : "#2563eb",
            color: "#fff", border: "none", borderRadius: "6px",
            fontWeight: 600, cursor: isPending ? "not-allowed" : "pointer",
            fontSize: "0.875rem", marginBottom: "1.35rem",
          }}
        >
          {isPending ? "Lagrer…" : "Lagre kuttetider"}
        </button>
      </div>

      {feedback && (
        <p style={{
          margin: "0.5rem 0 0", padding: "0.5rem 0.875rem", borderRadius: "6px",
          fontSize: "0.8rem",
          background: feedback.ok ? "#f0fdf4" : "#fef2f2",
          color:      feedback.ok ? "#166534"  : "#dc2626",
          border:     `1px solid ${feedback.ok ? "#bbf7d0" : "#fecaca"}`,
          display: "inline-block",
        }}>
          {feedback.msg}
        </p>
      )}
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.95rem",
  width: "130px",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#94a3b8",
  fontWeight: 400,
};
