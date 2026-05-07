"use client";

import { useRouter } from "next/navigation";

export interface QuarterOption {
  label: string;
  from:  string;
  to:    string;
}

interface Props {
  quarters: QuarterOption[];
  from:     string;
  to:       string;
}

export function QuarterSelector({ quarters, from, to }: Props) {
  const router = useRouter();

  function handleQuickSelect(q: QuarterOption) {
    router.push(`?from=${q.from}&to=${q.to}`);
  }

  function handleCustomSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    router.push(`?from=${fd.get("from")}&to=${fd.get("to")}`);
  }

  return (
    <div style={{ marginBottom: "1.75rem" }}>
      {/* Quick quarter buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151", alignSelf: "center" }}>
          Velg kvartal:
        </span>
        {quarters.map((q) => {
          const active = q.from === from && q.to === to;
          return (
            <button
              key={q.label}
              onClick={() => handleQuickSelect(q)}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: active ? "#3b82f6" : "#d1d5db",
                background:  active ? "#eff6ff" : "#fff",
                color:        active ? "#1e40af" : "#374151",
                fontWeight:   active ? 700 : 400,
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      {/* Custom date range */}
      <form
        onSubmit={handleCustomSubmit}
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}
      >
        <label style={labelStyle}>
          Fra
          <input name="from" type="date" defaultValue={from} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Til
          <input name="to" type="date" defaultValue={to} style={inputStyle} required />
        </label>
        <button type="submit" style={btnStyle}>Tilpasset periode</button>
      </form>
    </div>
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
};
const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1.1rem",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};
