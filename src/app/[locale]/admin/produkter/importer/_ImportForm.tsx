"use client";

import { useState, useRef } from "react";
import { importProductsAction, type CsvProductRow } from "@/app/actions/product-import";

// ─── Lightweight CSV parser (handles quoted fields) ───────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        row.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
      i++;
    }
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

const REQUIRED_HEADERS = ["sku", "name", "priceBase"] as const;
const ALL_HEADERS = ["sku", "name", "priceBase", "brand", "shortDescription", "partNumber", "categorySlug", "mvaRate"] as const;
type Header = typeof ALL_HEADERS[number];

function rowToProduct(headers: string[], row: string[]): CsvProductRow {
  const get = (key: string) => row[headers.indexOf(key)] ?? "";
  return {
    sku:              get("sku"),
    name:             get("name"),
    priceBase:        parseFloat(get("priceBase")),
    brand:            get("brand")            || undefined,
    shortDescription: get("shortDescription") || undefined,
    partNumber:       get("partNumber")       || undefined,
    categorySlug:     get("categorySlug")     || undefined,
    mvaRate:          get("mvaRate") ? parseFloat(get("mvaRate")) : undefined,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Stage = "idle" | "preview" | "importing" | "done";

interface ImportResult {
  created: number;
  skipped: number;
  errors:  string[];
}

export default function ImportForm() {
  const fileRef            = useRef<HTMLInputElement>(null);
  const [stage, setStage]  = useState<Stage>("idle");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows]    = useState<CsvProductRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── File selected ──────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);
    setStage("idle");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setParseError("Filen ser ut til å være tom eller mangler datalinjer.");
        return;
      }

      const hdrs = parsed[0].map((h) => h.toLowerCase().trim());
      const missing = REQUIRED_HEADERS.filter((r) => !hdrs.includes(r));
      if (missing.length > 0) {
        setParseError(`Mangler påkrevde kolonner: ${missing.join(", ")}`);
        return;
      }

      const dataRows = parsed.slice(1).map((r) => rowToProduct(hdrs, r));
      setHeaders(hdrs);
      setRows(dataRows);
      setStage("preview");
    };
    reader.readAsText(file, "UTF-8");
  }

  // ── Import confirmed ───────────────────────────────────────────

  async function handleImport() {
    setStage("importing");
    const res = await importProductsAction(rows);
    setResult(res);
    setStage("done");
  }

  // ── Reset ──────────────────────────────────────────────────────

  function handleReset() {
    setStage("idle");
    setRows([]);
    setHeaders([]);
    setParseError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Format guide ──────────────────────────────────────────── */}
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.25rem 1.5rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0 0 0.75rem",
          }}
        >
          CSV-format
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 0.6rem" }}>
          Første rad må være kolonnenavn. Påkrevd: <code>sku</code>, <code>name</code>,{" "}
          <code>priceBase</code>. Valgfritt:{" "}
          <code>brand</code>, <code>shortDescription</code>, <code>partNumber</code>,{" "}
          <code>categorySlug</code>, <code>mvaRate</code>.
        </p>
        <pre
          style={{
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            fontSize: "0.78rem",
            overflowX: "auto",
            margin: 0,
          }}
        >
{`sku,name,priceBase,brand,partNumber,categorySlug,mvaRate
HYD-001,Hydraulikkslange 1/2",150.00,Parker,H100-08,hydraulikk,0.25
LGR-044,Smørenippel M10,18.50,SKF,,smoring,0.25`}
        </pre>
      </div>

      {/* ── File upload ────────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.5rem",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#374151",
            marginBottom: "0.5rem",
          }}
        >
          Velg CSV-fil
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          style={{ fontSize: "0.875rem" }}
          disabled={stage === "importing"}
        />

        {parseError && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.6rem 0.9rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              color: "#dc2626",
              fontSize: "0.875rem",
            }}
          >
            {parseError}
          </div>
        )}
      </div>

      {/* ── Preview ────────────────────────────────────────────────── */}
      {stage === "preview" && rows.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "0.75rem 1.25rem",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h2
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#0f172a",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              Forhåndsvisning — {rows.length} rader
            </h2>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Viser maks 10 rader
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  {(["sku", "name", "priceBase", "brand", "partNumber", "categorySlug"] as Header[]).map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", color: "#475569", whiteSpace: "nowrap" }}>{row.sku}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#0f172a", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#0f172a", whiteSpace: "nowrap" }}>
                      {isNaN(row.priceBase) ? (
                        <span style={{ color: "#dc2626" }}>!</span>
                      ) : (
                        `kr ${row.priceBase.toFixed(2)}`
                      )}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#475569" }}>{row.brand ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", color: "#475569" }}>{row.partNumber ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "#475569" }}>{row.categorySlug ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 10 && (
            <p style={{ padding: "0.5rem 1.25rem", fontSize: "0.8rem", color: "#94a3b8", margin: 0, borderTop: "1px solid #f1f5f9" }}>
              … og {rows.length - 10} rader til
            </p>
          )}

          {/* Confirm / Cancel */}
          <div
            style={{
              padding: "1rem 1.25rem",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleImport}
              style={{
                padding: "0.6rem 1.4rem",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Importer {rows.length} produkter
            </button>
            <button
              onClick={handleReset}
              style={{
                padding: "0.6rem 1rem",
                background: "#f8fafc",
                color: "#475569",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* ── Importing spinner ──────────────────────────────────────── */}
      {stage === "importing" && (
        <div
          style={{
            padding: "1.5rem",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.9rem",
            color: "#475569",
          }}
        >
          <span style={{ fontSize: "1.25rem" }}>⏳</span>
          Importerer {rows.length} produkter… vennligst vent.
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────────────── */}
      {stage === "done" && result && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "1rem 1.5rem",
              background: result.created > 0 ? "#f0fdf4" : "#fef9c3",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#166534" }}>
              ✓ {result.created} opprettet
            </span>
            {result.skipped > 0 && (
              <span style={{ fontSize: "0.9rem", color: "#854d0e" }}>
                ↷ {result.skipped} hoppet over
              </span>
            )}
            {result.errors.length > 0 && (
              <span style={{ fontSize: "0.9rem", color: "#dc2626" }}>
                ✗ {result.errors.length} feil
              </span>
            )}
          </div>

          {result.errors.length > 0 && (
            <div style={{ padding: "1rem 1.5rem" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", margin: "0 0 0.5rem" }}>
                FEILMELDINGER
              </p>
              <ul style={{ margin: 0, padding: "0 0 0 1.2rem", fontSize: "0.8rem", color: "#dc2626" }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {result.created > 0 && (
            <div style={{ padding: "0 1.5rem 1rem", fontSize: "0.875rem", color: "#475569" }}>
              ✨ Berikelse og tilpasningsforslag kjøres nå i bakgrunnen for alle importerte produkter.
            </div>
          )}

          <div style={{ padding: "0.75rem 1.5rem", borderTop: "1px solid #e2e8f0", display: "flex", gap: "0.75rem" }}>
            <a
              href="/admin/produkter"
              style={{
                padding: "0.55rem 1.2rem",
                background: "#0f172a",
                color: "#fff",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Se produktlisten
            </a>
            <button
              onClick={handleReset}
              style={{
                padding: "0.55rem 1rem",
                background: "#f8fafc",
                color: "#475569",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Importer ny fil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
