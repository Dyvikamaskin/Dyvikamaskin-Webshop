"use client";

import { useState, useEffect, useCallback } from "react";
import { addFitmentAction, removeFitmentAction } from "@/app/actions/fitment";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FitmentModel {
  id: string;
  name: string;
  type: string;
  makeId: string;
  make: {
    id: string;
    name: string;
  };
}

interface Fitment {
  id: string;
  modelId: string;
  notes: string | null;
  model: FitmentModel;
}

interface ApiModel {
  id: string;
  name: string;
  type: string;
  series: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

interface ApiMake {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  initialFitments: Fitment[];
  productId: string;
  onFitmentsChange?: (fitments: Fitment[]) => void;
}

// ─── Norwegian type labels ──────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  EXCAVATOR: "Gravemaskin",
  MINI_EXCAVATOR: "Minigraver",
  WHEEL_LOADER: "Hjullaster",
  ARTICULATED_HAULER: "Dumper",
  BULLDOZER: "Bulldoser",
  MOTOR_GRADER: "Motorgrader",
  COMPACTOR: "Komprimator",
  TELEHANDLER: "Teleskoplaster",
  CRANE: "Kran",
  BACKHOE_LOADER: "Bakgraver",
  SKID_STEER: "Kompaktlaster",
  PIPELAYER: "Rørlegger",
  FORKLIFT: "Gaffeltruck",
  OTHER: "Annet",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function FitmentPicker({ initialFitments, productId, onFitmentsChange }: Props) {
  const [fitments, setFitments] = useState<Fitment[]>(initialFitments);

  // Make selector state
  const [makes, setMakes] = useState<ApiMake[]>([]);
  const [makesLoading, setMakesLoading] = useState(true);
  const [selectedMakeId, setSelectedMakeId] = useState("");

  // Models fetched for selected make
  const [allModels, setAllModels] = useState<ApiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Type filter
  const [selectedType, setSelectedType] = useState("");

  // Filtered models (by type)
  const [filteredModels, setFilteredModels] = useState<ApiModel[]>([]);

  // Model selector
  const [selectedModelId, setSelectedModelId] = useState("");

  // Action state
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch makes once on mount ───────────────────────────────────────────

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((data: ApiMake[]) => setMakes(data))
      .catch(() => setError("Kunne ikke laste fabrikater."))
      .finally(() => setMakesLoading(false));
  }, []);

  // ── Fetch models when make changes ─────────────────────────────────────

  useEffect(() => {
    setAllModels([]);
    setFilteredModels([]);
    setSelectedType("");
    setSelectedModelId("");
    if (!selectedMakeId) return;

    setModelsLoading(true);
    fetch(`/api/machines/models?makeId=${encodeURIComponent(selectedMakeId)}`)
      .then((r) => r.json())
      .then((data: ApiModel[]) => {
        setAllModels(data);
        setFilteredModels(data);
      })
      .catch(() => setError("Kunne ikke laste modeller."))
      .finally(() => setModelsLoading(false));
  }, [selectedMakeId]);

  // ── Filter models when type changes ────────────────────────────────────

  useEffect(() => {
    if (!selectedType) {
      setFilteredModels(allModels);
    } else {
      setFilteredModels(allModels.filter((m) => m.type === selectedType));
    }
    setSelectedModelId("");
  }, [selectedType, allModels]);

  // ── Unique types available for selected make ────────────────────────────

  const availableTypes = Array.from(new Set(allModels.map((m) => m.type))).sort();

  // ── Update parent on fitment change ────────────────────────────────────

  const syncFitments = useCallback(
    (next: Fitment[]) => {
      setFitments(next);
      onFitmentsChange?.(next);
    },
    [onFitmentsChange]
  );

  // ── Add fitment ────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!selectedModelId) return;
    setError(null);
    setAdding(true);

    const result = await addFitmentAction(productId, selectedModelId);

    setAdding(false);

    if (!result.ok || !result.fitment) {
      setError(result.error ?? "Ukjent feil.");
      return;
    }

    // Avoid duplicates in local state
    if (fitments.some((f) => f.modelId === selectedModelId)) return;

    syncFitments([...fitments, result.fitment as Fitment]);
    setSelectedModelId("");
  }

  // ── Remove fitment ─────────────────────────────────────────────────────

  async function handleRemove(modelId: string) {
    setError(null);
    const result = await removeFitmentAction(productId, modelId);
    if (!result.ok) {
      setError(result.error ?? "Ukjent feil.");
      return;
    }
    syncFitments(fitments.filter((f) => f.modelId !== modelId));
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1.25rem",
      }}
    >
      <h3
        style={{
          fontSize: "0.875rem",
          fontWeight: 700,
          color: "#0f172a",
          margin: "0 0 1rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Maskintilpasninger
      </h3>

      {/* ── Selectors row ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: "0.75rem",
        }}
      >
        {/* Make */}
        <label style={labelStyle}>
          Fabrikat
          <select
            value={selectedMakeId}
            onChange={(e) => setSelectedMakeId(e.target.value)}
            disabled={makesLoading}
            style={selectStyle}
          >
            <option value="">
              {makesLoading ? "Laster…" : "— Velg fabrikat —"}
            </option>
            {makes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {/* Type (optional) */}
        <label style={labelStyle}>
          Type <span style={{ color: "#94a3b8", fontWeight: 400 }}>(valgfritt)</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            disabled={!selectedMakeId || modelsLoading || availableTypes.length === 0}
            style={selectStyle}
          >
            <option value="">— Alle typer —</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>

        {/* Model */}
        <label style={labelStyle}>
          Modell
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={!selectedMakeId || modelsLoading || filteredModels.length === 0}
              style={{ ...selectStyle, paddingRight: modelsLoading ? "2rem" : undefined }}
            >
              <option value="">
                {modelsLoading
                  ? "Laster…"
                  : filteredModels.length === 0 && selectedMakeId
                  ? "Ingen modeller"
                  : "— Velg modell —"}
              </option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.series ? ` (${m.series})` : ""}
                  {m.yearFrom ? ` — ${m.yearFrom}–${m.yearTo ?? "nå"}` : ""}
                </option>
              ))}
            </select>
            {modelsLoading && (
              <span
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                  pointerEvents: "none",
                }}
              >
                ⟳
              </span>
            )}
          </div>
        </label>

        {/* Add button */}
        <button
          onClick={handleAdd}
          disabled={!selectedModelId || adding}
          style={{
            padding: "0.5rem 1.1rem",
            background: selectedModelId && !adding ? "#0f172a" : "#e2e8f0",
            color: selectedModelId && !adding ? "#fff" : "#94a3b8",
            border: "none",
            borderRadius: "6px",
            cursor: selectedModelId && !adding ? "pointer" : "default",
            fontWeight: 600,
            fontSize: "0.875rem",
            alignSelf: "flex-end",
            marginBottom: "1px",
            transition: "background 0.15s",
          }}
        >
          {adding ? "Legger til…" : "Legg til"}
        </button>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <p
          style={{
            margin: "0 0 0.75rem",
            color: "#dc2626",
            fontSize: "0.8rem",
            background: "#fef2f2",
            padding: "0.4rem 0.75rem",
            borderRadius: "4px",
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </p>
      )}

      {/* ── Fitment chips ─────────────────────────────────────────────────── */}
      {fitments.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem", margin: 0 }}>
          Ingen maskintilpasninger lagt til ennå.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {fitments.map((f) => (
            <div
              key={f.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "999px",
                padding: "0.3rem 0.75rem 0.3rem 0.9rem",
                fontSize: "0.8rem",
                color: "#1e293b",
              }}
            >
              <span>
                <strong>{f.model.make.name}</strong>
                {" — "}
                {f.model.name}
                <span style={{ color: "#64748b" }}> ({typeLabel(f.model.type)})</span>
              </span>
              <button
                onClick={() => handleRemove(f.modelId)}
                title="Fjern tilpasning"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  fontSize: "1rem",
                  lineHeight: 1,
                  padding: "0 0.1rem",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const selectStyle: React.CSSProperties = {
  padding: "0.45rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#1e293b",
  background: "#fff",
  minWidth: "180px",
  cursor: "pointer",
};
