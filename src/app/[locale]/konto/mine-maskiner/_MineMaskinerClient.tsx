"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSavedMachineAction,
  removeSavedMachineAction,
  updateSavedMachineAction,
  type SavedMachineRow,
} from "@/app/actions/saved-machine";

interface ModelOption {
  id: string;
  name: string;
  type: string;
}

interface MakeOption {
  id: string;
  name: string;
  models: ModelOption[];
}

interface Props {
  initialSaved: SavedMachineRow[];
  makes: MakeOption[];
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#0f172a",
  background: "#fff",
  boxSizing: "border-box",
  minWidth: "0",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.45rem 0.85rem",
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  borderRadius: "6px",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

const ghostButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
};

export function MineMaskinerClient({ initialSaved, makes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Add form state ─────────────────────────────────────────────────────
  const [makeId, setMakeId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");

  const selectedMake = makes.find((m) => m.id === makeId);
  const modelOptions = selectedMake?.models ?? [];

  function refresh() {
    router.refresh();
  }

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  function handleAdd() {
    if (!modelId) {
      showError("Velg en modell først.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addSavedMachineAction({
        modelId,
        label: label.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setMakeId("");
      setModelId("");
      setLabel("");
      setSerialNumber("");
      refresh();
    });
  }

  function handleRemove(id: string, modelName: string) {
    if (!confirm(`Fjern «${modelName}» fra Mine maskiner?`)) return;
    startTransition(async () => {
      const result = await removeSavedMachineAction(id);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div>
      {error ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "0.6rem 0.85rem",
            borderRadius: "6px",
            fontSize: "0.85rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* ── Add new ─────────────────────────────────────────────────── */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.1rem 1.25rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.95rem",
            fontWeight: 700,
            margin: "0 0 0.85rem",
            color: "#0f172a",
          }}
        >
          Legg til maskin
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.6rem" }}>
          <select
            value={makeId}
            onChange={(e) => {
              setMakeId(e.target.value);
              setModelId("");
            }}
            style={inputStyle}
            disabled={pending}
          >
            <option value="">— Velg merke —</option>
            {makes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            style={inputStyle}
            disabled={pending || !makeId}
          >
            <option value="">— Velg modell —</option>
            {modelOptions.map((mod) => (
              <option key={mod.id} value={mod.id}>
                {mod.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.85rem" }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Eget navn (valgfritt) — f.eks. "EC380 fra 2022"'
            style={inputStyle}
            disabled={pending}
          />
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Serienummer (valgfritt)"
            style={inputStyle}
            disabled={pending}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleAdd}
            style={buttonStyle}
            disabled={pending || !modelId}
          >
            + Lagre maskin
          </button>
        </div>
      </section>

      {/* ── Existing list ───────────────────────────────────────────── */}
      {initialSaved.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
          Du har ikke lagret noen maskiner ennå.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {initialSaved.map((m, i) => (
            <SavedRow
              key={m.id}
              entry={m}
              isLast={i === initialSaved.length - 1}
              pending={pending}
              startTransition={startTransition}
              showError={showError}
              refresh={refresh}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function SavedRow({
  entry,
  isLast,
  pending,
  startTransition,
  showError,
  refresh,
  onRemove,
}: {
  entry: SavedMachineRow;
  isLast: boolean;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  showError: (msg: string) => void;
  refresh: () => void;
  onRemove: (id: string, modelName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label ?? "");
  const [serialNumber, setSerialNumber] = useState(entry.serialNumber ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateSavedMachineAction({
        id: entry.id,
        label: label.trim() || null,
        serialNumber: serialNumber.trim() || null,
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setEditing(false);
      refresh();
    });
  }

  return (
    <li
      style={{
        padding: "0.85rem 1.1rem",
        borderBottom: isLast ? "none" : "1px solid #f1f5f9",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: "0" }}>
          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.95rem" }}>
            {entry.makeName} {entry.modelName}
          </div>
          {!editing && (entry.label || entry.serialNumber) && (
            <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.15rem" }}>
              {entry.label ? <span>{entry.label}</span> : null}
              {entry.label && entry.serialNumber ? <span> · </span> : null}
              {entry.serialNumber ? <span>S/N {entry.serialNumber}</span> : null}
            </div>
          )}
        </div>

        {!editing ? (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={ghostButtonStyle}
              disabled={pending}
            >
              Endre
            </button>
            <button
              type="button"
              onClick={() => onRemove(entry.id, `${entry.makeName} ${entry.modelName}`)}
              style={{ ...ghostButtonStyle, color: "#991b1b", borderColor: "#fecaca" }}
              disabled={pending}
            >
              Fjern
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div style={{ marginTop: "0.6rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Eget navn"
            style={inputStyle}
            disabled={pending}
          />
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Serienummer"
            style={inputStyle}
            disabled={pending}
          />
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setLabel(entry.label ?? "");
                setSerialNumber(entry.serialNumber ?? "");
              }}
              style={ghostButtonStyle}
              disabled={pending}
            >
              Avbryt
            </button>
            <button type="button" onClick={save} style={buttonStyle} disabled={pending}>
              Lagre
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
