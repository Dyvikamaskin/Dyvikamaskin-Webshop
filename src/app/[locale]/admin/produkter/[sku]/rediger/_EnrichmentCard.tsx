"use client";

import { useState } from "react";
import {
  acceptEnrichmentFieldAction,
  dismissEnrichmentProposalAction,
  type EnrichableField,
} from "@/app/actions/product-enrichment";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Proposal {
  suggestedName:  string | null;
  suggestedBrand: string | null;
  suggestedDesc:  string | null;
  suggestedImage: string | null;
}

interface CurrentValues {
  name:             string;
  brand:            string | null;
  shortDescription: string | null;
  mainImage:        string | null;
}

interface Props {
  sku:           string;
  proposal:      Proposal;
  currentValues: CurrentValues;
}

// ─── Field config ─────────────────────────────────────────────────────────────

interface FieldConfig {
  label:      string;
  field:      EnrichableField;
  proposed:   keyof Proposal;
  multiline?: boolean;
}

const FIELDS: FieldConfig[] = [
  { label: "Navn",        field: "name",             proposed: "suggestedName"  },
  { label: "Merke",       field: "brand",            proposed: "suggestedBrand" },
  { label: "Beskrivelse", field: "shortDescription", proposed: "suggestedDesc", multiline: true },
  { label: "Bilde-URL",   field: "mainImage",        proposed: "suggestedImage" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnrichmentCard({ sku, proposal: initial, currentValues }: Props) {
  const [proposal,   setProposal]   = useState<Proposal>(initial);
  const [busy,       setBusy]       = useState<string | null>(null); // field being accepted
  const [dismissed,  setDismissed]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const visibleFields = FIELDS.filter((f) => proposal[f.proposed] !== null);

  if (dismissed || visibleFields.length === 0) return null;

  // ── Accept one field ─────────────────────────────────────────────

  async function handleAccept(cfg: FieldConfig) {
    const value = proposal[cfg.proposed] as string;
    setBusy(cfg.field);
    setError(null);

    const res = await acceptEnrichmentFieldAction(sku, cfg.field, value);
    setBusy(null);

    if (!res.ok) {
      setError(res.error ?? "Noe gikk galt.");
      return;
    }

    // Null out the accepted field locally
    setProposal((prev) => ({ ...prev, [cfg.proposed]: null }));
  }

  // ── Dismiss all ──────────────────────────────────────────────────

  async function handleDismissAll() {
    setBusy("dismiss");
    setError(null);
    const res = await dismissEnrichmentProposalAction(sku);
    setBusy(null);
    if (!res.ok) { setError(res.error ?? "Noe gikk galt."); return; }
    setDismissed(true);
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #fbbf24",
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: "1.5rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.75rem 1.25rem",
          background: "#fffbeb",
          borderBottom: "1px solid #fde68a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1rem" }}>✨</span>
          <h2
            style={{
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#92400e",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: 0,
            }}
          >
            Berikelsesforslag — venter på godkjenning
          </h2>
          <span
            style={{
              fontSize: "0.7rem",
              background: "#fde68a",
              color: "#92400e",
              borderRadius: "999px",
              padding: "0.1rem 0.5rem",
              fontWeight: 600,
            }}
          >
            {visibleFields.length} felt
          </span>
        </div>

        <button
          onClick={handleDismissAll}
          disabled={busy !== null}
          style={{
            padding: "0.3rem 0.75rem",
            background: "transparent",
            color: "#92400e",
            border: "1px solid #fbbf24",
            borderRadius: "5px",
            cursor: busy !== null ? "default" : "pointer",
            fontSize: "0.78rem",
            fontWeight: 600,
            opacity: busy !== null ? 0.5 : 1,
          }}
        >
          {busy === "dismiss" ? "Avviser…" : "✗ Avvis alle"}
        </button>
      </div>

      {/* Field rows */}
      <div style={{ padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {error && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "5px",
              color: "#dc2626",
              fontSize: "0.8rem",
            }}
          >
            {error}
          </div>
        )}

        {visibleFields.map((cfg) => {
          const suggested = proposal[cfg.proposed] as string;
          const current   = cfg.field === "name"
            ? currentValues.name
            : cfg.field === "brand"
              ? currentValues.brand
              : cfg.field === "shortDescription"
                ? currentValues.shortDescription
                : currentValues.mainImage;
          const isBusy = busy === cfg.field;

          return (
            <div
              key={cfg.field}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              {/* Field label */}
              <div
                style={{
                  padding: "0.4rem 0.9rem",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {cfg.label}
                </span>
                <button
                  onClick={() => handleAccept(cfg)}
                  disabled={isBusy || busy !== null}
                  style={{
                    padding: "0.25rem 0.65rem",
                    background: isBusy ? "#e2e8f0" : "#dcfce7",
                    color: isBusy ? "#94a3b8" : "#166534",
                    border: "1px solid #bbf7d0",
                    borderRadius: "4px",
                    cursor: isBusy || busy !== null ? "default" : "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {isBusy ? "Lagrer…" : "✓ Bruk dette"}
                </button>
              </div>

              {/* Values */}
              <div style={{ padding: "0.65rem 0.9rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {/* Suggested */}
                <div>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 600,
                      color: "#16a34a",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginRight: "0.4rem",
                    }}
                  >
                    Forslag
                  </span>
                  {cfg.field === "mainImage" ? (
                    <a
                      href={suggested}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.8rem", color: "#2563eb", wordBreak: "break-all" }}
                    >
                      {suggested}
                    </a>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: "#0f172a",
                        whiteSpace: cfg.multiline ? "pre-wrap" : undefined,
                      }}
                    >
                      {suggested}
                    </span>
                  )}
                </div>

                {/* Current value (if any) */}
                {current && (
                  <div>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginRight: "0.4rem",
                      }}
                    >
                      Nåværende
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>{current}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: "0.5rem 1.25rem",
          borderTop: "1px solid #fde68a",
          background: "#fffbeb",
          fontSize: "0.75rem",
          color: "#92400e",
        }}
      >
        Kilde: DuckDuckGo, Icecat, Wikidata. Klikk «Bruk dette» på feltene du vil beholde, eller «Avvis alle» for å fjerne forslagene.
      </div>
    </div>
  );
}
