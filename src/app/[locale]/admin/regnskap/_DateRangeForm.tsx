"use client";

import { useRouter } from "next/navigation";

interface Props {
  from: string;
  to:   string;
}

export function DateRangeForm({ from, to }: Props) {
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams({
      from: String(fd.get("from") ?? ""),
      to:   String(fd.get("to")   ?? ""),
    });
    router.push(`?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.5rem" }}
    >
      <label style={labelStyle}>
        Fra
        <input name="from" type="date" defaultValue={from} style={inputStyle} required />
      </label>
      <label style={labelStyle}>
        Til
        <input name="to" type="date" defaultValue={to} style={inputStyle} required />
      </label>
      <button type="submit" style={btnStyle}>
        Vis periode
      </button>
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
};
const btnStyle: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};
