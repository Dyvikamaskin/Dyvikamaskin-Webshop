"use client";

import { useState } from "react";
import FitmentPicker from "@/components/fitment/FitmentPicker";
import { addFitmentAction } from "@/app/actions/fitment";
import type { FitmentProposal } from "@/lib/fitment-enrichment";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FitmentModel {
  id: string;
  name: string;
  type: string;
  makeId: string;
  make: { id: string; name: string };
}

interface Fitment {
  id: string;
  modelId: string;
  notes: string | null;
  model: FitmentModel;
}

interface Props {
  productId: string;
  sku: string;
  partNumber?: string | null;
  ean?: string | null;
  brand?: string | null;
  productName: string;
  initialFitments: Fitment[];
}

// ─── Norwegian type labels ────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  EXCAVATOR:          "Gravemaskin",
  MINI_EXCAVATOR:     "Minigraver",
  WHEEL_LOADER:       "Hjullaster",
  ARTICULATED_HAULER: "Dumper",
  BULLDOZER:          "Bulldoser",
  MOTOR_GRADER:       "Motorgrader",
  COMPACTOR:          "Komprimator",
  TELEHANDLER:        "Teleskoplaster",
  CRANE:              "Kran",
  BACKHOE_LOADER:     "Bakgraver",
  SKID_STEER:         "Kompaktlaster",
  PIPELAYER:          "Rørlegger",
  FORKLIFT:           "Gaffeltruck",
  OTHER:              "Annet",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<
  "high" | "medium" | "low",
  { bg: string; color: string; label: string }
> = {
  high:   { bg: "#dcfce7", color: "#166534", label: "Høy" },
  medium: { bg: "#fef9c3", color: "#854d0e", label: "Middels" },
  low:    { bg: "#f1f5f9", color: "#475569", label: "Lav" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FitmentSection({
  productId,
  sku,
  partNumber,
  ean,
  brand,
  productName,
  initialFitments,
}: Props) {
  const [fitments, setFitments] = useState<Fitment[]>(initialFitments);
  const [proposals, setProposals] = useState<FitmentProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  // ── Auto-suggest ─────────────────────────────────────────────────

  async function handleSuggest() {
    setError(null);
    setProposals([]);
    setLoading(true);

    try {
      const res = await fetch("/api/fitment/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          sku,
          partNumber:  partNumber ?? undefined,
          ean:         ean ?? undefined,
          brand:       brand ?? undefined,
          name:        productName,
        }),
      });

      const data = await res.json() as { ok: boolean; proposals?: FitmentProposal[]; error?: string };

      if (!data.ok) {
        setError(data.error ?? "Søket feilet.");
        return;
      }

      setProposals(data.proposals ?? []);
      setSearched(true);
    } catch {
      setError("Nettverksfeil – prøv igjen.");
    } finally {
      setLoading(false);
    }
  }

  // ── Accept proposal ──────────────────────────────────────────────

  async function handleAccept(proposal: FitmentProposal) {
    setAddingId(proposal.modelId);
    const result = await addFitmentAction(productId, proposal.modelId);
    setAddingId(null);

    if (!result.ok || !result.fitment) {
      setError(result.error ?? "Kunne ikke legge til.");
      return;
    }

    // Add to live fitments and remove from proposals
    setFitments((prev) => [...prev, result.fitment as Fitment]);
    setProposals((prev) => prev.filter((p) => p.modelId !== proposal.modelId));
  }

  // ── Ignore proposal ──────────────────────────────────────────────

  function handleIgnore(modelId: string) {
    setProposals((prev) => prev.filter((p) => p.modelId !== modelId));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── FitmentPicker ─────────────────────────────────────────── */}
      <FitmentPicker
        initialFitments={fitments}
        productId={productId}
        onFitmentsChange={setFitments}
      />

      {/* ── Auto-suggest button ───────────────────────────────────── */}
      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={handleSuggest}
          disabled={loading}
          style={{
            padding: "0.55rem 1.1rem",
            background: loading ? "#e2e8f0" : "#0f172a",
            color: loading ? "#94a3b8" : "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "default" : "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          {loading ? "Søker på nettet…" : "🔍 Auto-foreslå tilpasninger fra nettet"}
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && (
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
          {error}
        </div>
      )}

      {/* ── Proposals panel ───────────────────────────────────────── */}
      {proposals.length > 0 && (
        <div
          style={{
            marginTop: "1.25rem",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "0.75rem 1.25rem",
              borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#0f172a",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Forslag ({proposals.length})
            </h3>
          </div>

          <div style={{ padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {proposals.map((proposal) => {
              const alreadyAdded = fitments.some((f) => f.modelId === proposal.modelId);
              const conf = CONFIDENCE_STYLES[proposal.confidence];
              const isAdding = addingId === proposal.modelId;

              return (
                <div
                  key={proposal.modelId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.65rem 0.9rem",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    background: alreadyAdded ? "#f8fafc" : "#fff",
                    opacity: alreadyAdded ? 0.6 : 1,
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Left: name + type */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem" }}>
                      {proposal.makeName}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "0.875rem" }}>
                      {" — "}{proposal.modelName}
                    </span>
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                      }}
                    >
                      {typeLabel(proposal.type)}
                    </span>
                  </div>

                  {/* Confidence badge */}
                  <span
                    style={{
                      padding: "0.2rem 0.55rem",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background: conf.bg,
                      color: conf.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {conf.label}
                  </span>

                  {/* Actions */}
                  {alreadyAdded ? (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                        fontStyle: "italic",
                      }}
                    >
                      Allerede lagt til
                    </span>
                  ) : (
                    <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                      <button
                        onClick={() => handleAccept(proposal)}
                        disabled={isAdding}
                        style={{
                          padding: "0.3rem 0.7rem",
                          background: isAdding ? "#e2e8f0" : "#dcfce7",
                          color: isAdding ? "#94a3b8" : "#166534",
                          border: "1px solid #bbf7d0",
                          borderRadius: "5px",
                          cursor: isAdding ? "default" : "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                        }}
                      >
                        {isAdding ? "Legger til…" : "✓ Legg til"}
                      </button>
                      <button
                        onClick={() => handleIgnore(proposal.modelId)}
                        disabled={isAdding}
                        style={{
                          padding: "0.3rem 0.7rem",
                          background: "#f8fafc",
                          color: "#64748b",
                          border: "1px solid #e2e8f0",
                          borderRadius: "5px",
                          cursor: isAdding ? "default" : "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 500,
                        }}
                      >
                        ✗ Ignorer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty proposals state (after a search that returned nothing) ── */}
      {!loading && searched && proposals.length === 0 && error === null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            color: "#94a3b8",
            fontSize: "0.875rem",
          }}
        >
          Ingen forslag funnet.
        </div>
      )}
    </div>
  );
}
