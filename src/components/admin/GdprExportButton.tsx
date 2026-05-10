"use client";

import { useState, useTransition } from "react";
import { exportCustomerDataAction } from "@/app/actions/gdpr";

interface Props {
  profileId: string;
  customerName: string;
}

export function GdprExportButton({ profileId, customerName }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      try {
        const json = await exportCustomerDataAction(profileId);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gdpr-eksport-${customerName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ukjent feil");
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleExport}
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
        {pending ? "Genererer …" : "Last ned JSON-eksport"}
      </button>
      {error ? (
        <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: "0.6rem" }}>{error}</p>
      ) : null}
    </div>
  );
}
