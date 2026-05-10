"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendQuoteAction,
  acceptQuoteAction,
  rejectQuoteAction,
  convertQuoteToOrderAction,
} from "@/app/actions/quotes";

interface Props {
  quoteId: string;
  status: string;
}

export function QuoteActionsBar({ quoteId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string; saleId?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error ?? "Ukjent feil");
        return;
      }
      if (r.saleId) {
        router.push(`/admin/ordrer/${r.saleId}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem" }}>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.6rem" }}>Handlinger</h2>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {status === "DRAFT" ? (
          <button onClick={() => run(() => sendQuoteAction(quoteId))} disabled={pending} style={{ ...btn, background: "#3b82f6" }}>
            Marker som sendt
          </button>
        ) : null}

        {status === "SENT" ? (
          <>
            <button onClick={() => run(() => acceptQuoteAction(quoteId))} disabled={pending} style={{ ...btn, background: "#16a34a" }}>
              Kunde aksepterte
            </button>
            <button onClick={() => run(() => rejectQuoteAction(quoteId))} disabled={pending} style={{ ...btn, background: "#dc2626" }}>
              Kunde avviste
            </button>
          </>
        ) : null}

        {status === "ACCEPTED" ? (
          <button onClick={() => run(() => convertQuoteToOrderAction(quoteId))} disabled={pending} style={{ ...btn, background: "#0f172a" }}>
            Konverter til ordre
          </button>
        ) : null}
      </div>

      {error ? <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: "0.6rem" }}>{error}</p> : null}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "0.5rem 1rem",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
};
