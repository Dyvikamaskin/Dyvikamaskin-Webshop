"use client";

import { useTransition, useState } from "react";
import { markCollectedAction } from "@/app/actions/fulfillment";

interface Props {
  saleId:        string;
  storeName:     string;
  customerName:  string;
  customerEmail: string;
  customerPhone: string | null;
  readySince:    string;
  items: { sku: string; productName: string; quantity: number }[];
}

export default function PickupQueue({
  saleId, storeName, customerName, customerEmail, customerPhone, readySince, items,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [collected, setCollected]    = useState(false);
  const [error,     setError]        = useState<string | null>(null);

  if (collected) return null;

  const waitMinutes = Math.floor(
    (Date.now() - new Date(readySince).getTime()) / 60000
  );
  const waitLabel =
    waitMinutes < 60
      ? `${waitMinutes} min siden`
      : `${Math.floor(waitMinutes / 60)} t ${waitMinutes % 60} min siden`;

  function handleCollected() {
    startTransition(async () => {
      const result = await markCollectedAction(saleId);
      if (result.ok) {
        setCollected(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ background: "#fff", border: "1.5px solid #a78bfa", borderRadius: "8px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#ede9fe", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.875rem", color: "#4c1d95" }}>{customerName}</p>
          <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "#7c3aed" }}>
            {customerEmail}
            {customerPhone && <span> · {customerPhone}</span>}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "0.7rem", color: "#7c3aed" }}>{storeName}</p>
          <p style={{ margin: "0.1rem 0 0", fontSize: "0.7rem", color: "#9333ea" }}>Klar for {waitLabel}</p>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: "0.625rem 1rem" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
            <span style={{ color: "#374151" }}>{item.productName}</span>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>× {item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Action */}
      <div style={{ padding: "0.625rem 1rem 0.875rem", borderTop: "1px solid #f1f5f9" }}>
        {error && <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#dc2626" }}>{error}</p>}
        <button
          onClick={handleCollected}
          disabled={isPending}
          style={{
            width: "100%", padding: "0.5rem",
            background: isPending ? "#c4b5fd" : "#7c3aed",
            color: "#fff", border: "none", borderRadius: "6px",
            fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
          }}
        >
          {isPending ? "Registrerer…" : "✓ Kunde har hentet"}
        </button>
      </div>
    </div>
  );
}
