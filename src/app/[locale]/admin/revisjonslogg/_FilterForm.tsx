"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const TARGET_TYPES = [
  "Sale", "Profile", "Product", "StoreStock", "StocktakeSession", "Promotion",
  "ProductDraft", "Store",
];

export function FilterForm() {
  const router = useRouter();
  const sp = useSearchParams();

  const push = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, sp]
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        push({
          action:     String(fd.get("action")     ?? ""),
          targetType: String(fd.get("targetType") ?? ""),
          from:       String(fd.get("from")       ?? ""),
          to:         String(fd.get("to")         ?? ""),
        });
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.5rem" }}
    >
      <label style={labelStyle}>
        Hendelse
        <input
          name="action"
          defaultValue={sp.get("action") ?? ""}
          placeholder="f.eks. ORDER_STATUS_UPDATED"
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Måltype
        <select name="targetType" defaultValue={sp.get("targetType") ?? ""} style={inputStyle}>
          <option value="">Alle</option>
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Fra dato
        <input name="from" type="date" defaultValue={sp.get("from") ?? ""} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Til dato
        <input name="to" type="date" defaultValue={sp.get("to") ?? ""} style={inputStyle} />
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" style={btnPrimary}>Filtrer</button>
        <button
          type="button"
          style={btnSecondary}
          onClick={() => router.push("?")}
        >
          Nullstill
        </button>
      </div>
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
  padding: "0.45rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem",
  minWidth: "180px",
};

const btnPrimary: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};

const btnSecondary: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "#f1f5f9",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.875rem",
};
