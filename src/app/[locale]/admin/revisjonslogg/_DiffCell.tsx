"use client";

import { useState } from "react";

export function DiffCell({
  prev,
  next,
}: {
  prev: unknown;
  next: unknown;
}) {
  const [open, setOpen] = useState(false);
  const hasPrev = prev !== null && prev !== undefined;
  const hasNext = next !== null && next !== undefined;

  if (!hasPrev && !hasNext) {
    return <span style={{ color: "#94a3b8" }}>–</span>;
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "0.2rem 0.6rem",
          background: open ? "#e0f2fe" : "#f1f5f9",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "0.75rem",
          color: "#374151",
        }}
      >
        {open ? "▲ Skjul" : "▼ Vis diff"}
      </button>

      {open && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "0.5rem",
            maxWidth: "560px",
          }}
        >
          {hasPrev && (
            <pre
              style={{
                flex: 1,
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: "4px",
                padding: "0.5rem",
                fontSize: "0.7rem",
                overflow: "auto",
                maxHeight: "200px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                color: "#7f1d1d",
              }}
            >
              {JSON.stringify(prev, null, 2)}
            </pre>
          )}
          {hasNext && (
            <pre
              style={{
                flex: 1,
                background: "#dcfce7",
                border: "1px solid #86efac",
                borderRadius: "4px",
                padding: "0.5rem",
                fontSize: "0.7rem",
                overflow: "auto",
                maxHeight: "200px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                color: "#14532d",
              }}
            >
              {JSON.stringify(next, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
