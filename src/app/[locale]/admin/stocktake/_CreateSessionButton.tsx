"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStocktakeSessionAction } from "@/app/actions/stocktake";

interface Props {
  stores: { id: string; name: string }[];
}

export default function CreateSessionButton({ stores }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [isBlind, setIsBlind] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!storeId) { setError("Velg et lager."); return; }
    startTransition(async () => {
      const result = await createStocktakeSessionAction(storeId, isBlind);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/admin/stocktake/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        {/* Store */}
        <label style={labelStyle}>
          Lager
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            style={inputStyle}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        {/* Blind option */}
        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: "0.5rem", paddingBottom: "0.45rem" }}>
          <input
            type="checkbox"
            checked={isBlind}
            onChange={(e) => setIsBlind(e.target.checked)}
            style={{ width: "16px", height: "16px" }}
          />
          <span style={{ fontSize: "0.875rem", color: "#374151" }}>
            Blind telling
            <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>
              (forventet antall skjules)
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={isPending || !storeId}
          style={{
            padding: "0.5rem 1.25rem",
            background: isPending ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            height: "38px",
          }}
        >
          {isPending ? "Oppretter…" : "Start varetelling"}
        </button>
      </div>

      {error && (
        <p style={{ marginTop: "0.5rem", color: "#dc2626", fontSize: "0.875rem" }}>{error}</p>
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
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  padding: "0.45rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#1e293b",
};
