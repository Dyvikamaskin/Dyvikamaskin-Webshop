"use client";

/**
 * Downloads a PDF of warehouse labels for all products in the given store.
 * Calls POST /api/labels/warehouse with { storeId }.
 */

import { useState } from "react";

interface Props {
  storeId: string;
  storeName: string;
}

export default function PrintLabelsButton({ storeId, storeName }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/labels/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `etiketter-${storeName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "0.5rem 1.25rem",
          background: loading ? "#64748b" : "#0f172a",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: "0.875rem",
        }}
      >
        {loading ? "Genererer PDF…" : "🖨️ Skriv ut alle etiketter"}
      </button>
      {error && (
        <span style={{ fontSize: "0.8rem", color: "#dc2626" }}>{error}</span>
      )}
    </div>
  );
}
