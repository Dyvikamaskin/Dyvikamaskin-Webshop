"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveReturnAction,
  rejectReturnAction,
  markReturnReceivedAction,
  refundReturnAction,
} from "@/app/actions/returns";

interface Props {
  returnRequestId: string;
  status: string;
  maxRefundAmount: string;
  hasVipps: boolean;
}

export function ReturnActionsBar({ returnRequestId, status, maxRefundAmount, hasVipps }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectNotes, setRejectNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState(maxRefundAmount);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error ?? "Ukjent feil");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem 1.25rem" }}>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 0, marginBottom: "0.6rem" }}>Handlinger</h2>

      {status === "PENDING" ? (
        <>
          <button
            onClick={() => run(() => approveReturnAction(returnRequestId))}
            disabled={pending}
            style={{ ...btnStyle, background: "#16a34a", marginRight: "0.5rem" }}
          >
            Godkjenn retur
          </button>

          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>
              Avvis (med begrunnelse)
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Hvorfor avvist? Sendes til kunde."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => run(() => rejectReturnAction(returnRequestId, rejectNotes))}
                disabled={pending || rejectNotes.trim().length === 0}
                style={{ ...btnStyle, background: "#dc2626" }}
              >
                Avvis
              </button>
            </div>
          </div>
        </>
      ) : null}

      {status === "APPROVED" ? (
        <button
          onClick={() => run(() => markReturnReceivedAction(returnRequestId))}
          disabled={pending}
          style={{ ...btnStyle, background: "#8b5cf6" }}
        >
          Marker som mottatt på lager
        </button>
      ) : null}

      {(status === "APPROVED" || status === "RECEIVED") ? (
        <div style={{ marginTop: "0.75rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>
            Refunder beløp (kr, maks {maxRefundAmount})
            {hasVipps ? " — sendes via Vipps" : " — manuell bankoverføring"}
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="number"
              min="0.01"
              max={maxRefundAmount}
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              style={{ ...inputStyle, width: "180px" }}
            />
            <button
              onClick={() => run(() => refundReturnAction(returnRequestId, refundAmount))}
              disabled={pending || !refundAmount}
              style={{ ...btnStyle, background: "#0f172a" }}
            >
              Refunder
            </button>
          </div>
        </div>
      ) : null}

      {(status === "REFUNDED" || status === "REJECTED") ? (
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Saken er avsluttet ({status === "REFUNDED" ? "refundert" : "avvist"}).
        </p>
      ) : null}

      {error ? (
        <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: "0.6rem" }}>{error}</p>
      ) : null}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  padding: "0.45rem 0.7rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.875rem",
};
