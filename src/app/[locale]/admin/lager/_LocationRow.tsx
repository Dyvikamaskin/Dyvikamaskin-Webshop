"use client";

import { useState, useTransition } from "react";
import { updateLocationCodeAction } from "@/app/actions/admin";
import {
  buildLocationCode,
  parseLocationCode,
  LOCATION_ZONES,
} from "@/lib/location-code";

interface Props {
  storeStockId: string;
  sku: string;
  productName: string;
  quantity: number;
  currentCode: string | null;
}

export default function LocationRow({
  storeStockId,
  sku,
  productName,
  quantity,
  currentCode,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(currentCode);

  // Initialise form from existing code (if any)
  const parsed = currentCode ? parseLocationCode(currentCode) : null;
  const [zone,  setZone]  = useState(parsed?.zone  ?? "");
  const [aisle, setAisle] = useState(parsed?.aisle ?? "");
  const [rack,  setRack]  = useState(parsed?.rack  ?? "");
  const [shelf, setShelf] = useState(parsed?.shelf ?? "");
  const [slot,  setSlot]  = useState(parsed?.slot  ?? "");

  // Live preview of the code as the user types
  const preview = buildLocationCode({ zone, aisle, rack, shelf, slot });

  function handleSave() {
    setError(null);
    if (!zone) {
      setError("Velg sone.");
      return;
    }
    if (!preview) {
      setError("Fyll inn alle felt korrekt.");
      return;
    }

    startTransition(async () => {
      const result = await updateLocationCodeAction(storeStockId, {
        zone, aisle, rack, shelf, slot,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedCode(preview);
      setEditing(false);
    });
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const result = await updateLocationCodeAction(storeStockId, null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedCode(null);
      setZone(""); setAisle(""); setRack(""); setShelf(""); setSlot("");
      setEditing(false);
    });
  }

  return (
    <tr
      style={{
        borderBottom: "1px solid #f1f5f9",
        background: editing ? "#f8fafc" : "#fff",
      }}
    >
      {/* SKU */}
      <td style={{ padding: "0.625rem 1rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#334155", whiteSpace: "nowrap" }}>
        {sku}
      </td>

      {/* Product name */}
      <td style={{ padding: "0.625rem 1rem", color: "#1e293b", fontSize: "0.875rem" }}>
        {productName}
      </td>

      {/* Quantity */}
      <td style={{ padding: "0.625rem 1rem", textAlign: "right", color: "#374151", fontSize: "0.875rem" }}>
        {quantity}
      </td>

      {/* Location code / editor */}
      <td style={{ padding: "0.625rem 1rem" }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {/* Five-field row */}
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              {/* Zone */}
              <label style={microLabel}>
                Sone
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  style={microInput}
                >
                  <option value="">– velg –</option>
                  {LOCATION_ZONES.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Aisle */}
              <label style={microLabel}>
                Gang
                <input
                  type="text"
                  maxLength={2}
                  placeholder="A"
                  value={aisle}
                  onChange={(e) => setAisle(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  style={{ ...microInput, width: "48px", textTransform: "uppercase" }}
                />
              </label>

              {/* Rack */}
              <label style={microLabel}>
                Reol
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder="01"
                  value={rack.replace(/^0+/, "") || ""}
                  onChange={(e) => setRack(String(e.target.value).padStart(2, "0"))}
                  style={{ ...microInput, width: "56px" }}
                />
              </label>

              {/* Shelf */}
              <label style={microLabel}>
                Nivå
                <input
                  type="text"
                  maxLength={2}
                  placeholder="A"
                  value={shelf}
                  onChange={(e) => setShelf(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  style={{ ...microInput, width: "48px", textTransform: "uppercase" }}
                />
              </label>

              {/* Slot */}
              <label style={microLabel}>
                Plass
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder="01"
                  value={slot.replace(/^0+/, "") || ""}
                  onChange={(e) => setSlot(String(e.target.value).padStart(2, "0"))}
                  style={{ ...microInput, width: "56px" }}
                />
              </label>
            </div>

            {/* Live preview */}
            {preview && (
              <div style={{ fontSize: "0.8rem" }}>
                <span style={{ color: "#64748b" }}>Kode: </span>
                <code
                  style={{
                    background: "#f0fdf4",
                    color: "#166534",
                    border: "1px solid #bbf7d0",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    fontWeight: 700,
                  }}
                >
                  {preview}
                </code>
              </div>
            )}

            {/* Error */}
            {error && (
              <p style={{ margin: 0, fontSize: "0.775rem", color: "#dc2626" }}>{error}</p>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                onClick={handleSave}
                disabled={isPending || !preview}
                style={{
                  padding: "0.35rem 0.875rem",
                  background: isPending || !preview ? "#93c5fd" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "5px",
                  cursor: isPending || !preview ? "not-allowed" : "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                {isPending ? "Lagrer…" : "Lagre"}
              </button>
              {savedCode && (
                <button
                  onClick={handleClear}
                  disabled={isPending}
                  style={{
                    padding: "0.35rem 0.75rem",
                    background: "#fef2f2",
                    color: "#991b1b",
                    border: "1px solid #fecaca",
                    borderRadius: "5px",
                    cursor: isPending ? "not-allowed" : "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  Slett kode
                </button>
              )}
              <button
                onClick={() => { setEditing(false); setError(null); }}
                style={{
                  padding: "0.35rem 0.75rem",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  color: "#475569",
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {savedCode ? (
              <code
                style={{
                  background: "#f0fdf4",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {savedCode}
              </code>
            ) : (
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic" }}>
                Ikke satt
              </span>
            )}
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "0.25rem 0.625rem",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "0.75rem",
                color: "#475569",
              }}
            >
              {savedCode ? "Endre" : "Sett kode"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const microLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const microInput: React.CSSProperties = {
  padding: "0.35rem 0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: "5px",
  fontSize: "0.8rem",
  color: "#1e293b",
  background: "#fff",
};
