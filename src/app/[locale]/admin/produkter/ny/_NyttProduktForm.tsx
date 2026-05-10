"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProductAction } from "@/app/actions/product";
import { CategoryPicker } from "@/components/admin/CategoryPicker";

interface Category {
  id:   string;
  name: string;
  /** Full slash-path from root, e.g. "verktoy/elektroverktoy". */
  path: string;
}

interface Props {
  categories: Category[];
}

// ─── Shared input style ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#0f172a",
  background: "#fff",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.3rem",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#94a3b8",
  marginTop: "0.2rem",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NyttProduktForm({ categories }: Props) {
  const router  = useRouter();
  const [pending,             setPending]             = useState(false);
  const [error,               setError]               = useState<string | null>(null);
  const [replacesPartNumbers, setReplacesPartNumbers] = useState<string[]>([]);
  const [replaceInput,        setReplaceInput]        = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);

    const result = await createProductAction({
      sku:                  (fd.get("sku")              as string).trim(),
      name:                 (fd.get("name")             as string).trim(),
      priceBase:            parseFloat(fd.get("priceBase") as string),
      brand:                (fd.get("brand")            as string) || undefined,
      shortDescription:     (fd.get("shortDescription") as string) || undefined,
      partNumber:           (fd.get("partNumber")       as string) || undefined,
      categoryPath:         (fd.get("categoryPath")     as string) || undefined,
      mvaRate:              parseFloat(fd.get("mvaRate") as string) || 0.25,
      isActive:             fd.get("isActive") !== "false",
      replacesPartNumbers,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error ?? "Noe gikk galt.");
      return;
    }

    router.push(`/admin/produkter/${encodeURIComponent(result.sku!)}/rediger`);
  }

  function addReplaceTag() {
    const val = replaceInput.trim();
    if (!val) return;
    if (!replacesPartNumbers.includes(val)) {
      setReplacesPartNumbers((prev) => [...prev, val]);
    }
    setReplaceInput("");
  }

  function removeReplaceTag(tag: string) {
    setReplacesPartNumbers((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.1rem",
        }}
      >
        {/* SKU */}
        <div>
          <label htmlFor="sku" style={labelStyle}>
            SKU <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            id="sku"
            name="sku"
            type="text"
            required
            placeholder="f.eks. HYD-001"
            style={{ ...inputStyle, fontFamily: "monospace" }}
          />
          <p style={hintStyle}>Unik produktkode — kan ikke endres etter lagring.</p>
        </div>

        {/* Navn */}
        <div>
          <label htmlFor="name" style={labelStyle}>
            Produktnavn <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="f.eks. Hydraulikkslange 1/2&quot;"
            style={inputStyle}
          />
          <p style={hintStyle}>La stå tom for å la berikelsespipelinen foreslå navn.</p>
        </div>

        {/* Pris og MVA — side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="priceBase" style={labelStyle}>
              Pris ekskl. MVA (kr) <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              id="priceBase"
              name="priceBase"
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="mvaRate" style={labelStyle}>MVA-sats</label>
            <select id="mvaRate" name="mvaRate" defaultValue="0.25" style={inputStyle}>
              <option value="0.25">25% (standard)</option>
              <option value="0.15">15% (matvarer)</option>
              <option value="0.12">12% (persontransport)</option>
              <option value="0">0% (fritatt)</option>
            </select>
          </div>
        </div>

        {/* Merke og delenummer — side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="brand" style={labelStyle}>Merke</label>
            <input
              id="brand"
              name="brand"
              type="text"
              placeholder="f.eks. Parker"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="partNumber" style={labelStyle}>Delenummer</label>
            <input
              id="partNumber"
              name="partNumber"
              type="text"
              placeholder="f.eks. H100-08"
              style={{ ...inputStyle, fontFamily: "monospace" }}
            />
            <p style={hintStyle}>Brukes av berikelsespipelinen til søk.</p>
          </div>
        </div>

        {/* Kort beskrivelse */}
        <div>
          <label htmlFor="shortDescription" style={labelStyle}>Kort beskrivelse</label>
          <textarea
            id="shortDescription"
            name="shortDescription"
            rows={3}
            placeholder="Valgfritt — lar du dette stå tomt, fyller pipelinen det inn."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {/* Erstatter delenummer */}
        <div>
          <label style={labelStyle}>Erstatter delenummer(e)</label>
          {/* Tag chips */}
          {replacesPartNumbers.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
                marginBottom: "0.4rem",
              }}
            >
              {replacesPartNumbers.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.2rem 0.55rem",
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    fontFamily: "monospace",
                    color: "#0f172a",
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeReplaceTag(tag)}
                    aria-label={`Fjern ${tag}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0",
                      lineHeight: 1,
                      color: "#64748b",
                      fontSize: "0.9rem",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Input + add button */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={replaceInput}
              onChange={(e) => setReplaceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addReplaceTag(); }
              }}
              placeholder="f.eks. OLD-PART-42"
              style={{ ...inputStyle, fontFamily: "monospace", flex: 1 }}
            />
            <button
              type="button"
              onClick={addReplaceTag}
              style={{
                padding: "0.55rem 0.9rem",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                color: "#0f172a",
              }}
            >
              + Legg til
            </button>
          </div>
          <p style={hintStyle}>Delenummer(e) dette produktet erstatter. Trykk Enter eller &quot;Legg til&quot;.</p>
        </div>

        {/* Kategori */}
        <div>
          <label style={labelStyle}>Kategori</label>
          <CategoryPicker categories={categories} />
        </div>

        {/* Aktiv */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked
            value="true"
            style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
          />
          <label htmlFor="isActive" style={{ ...labelStyle, margin: 0, cursor: "pointer" }}>
            Aktiv (synlig i butikken)
          </label>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "0.65rem 1rem",
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

        {/* Submit */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", paddingTop: "0.25rem" }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              padding: "0.6rem 1.4rem",
              background: pending ? "#e2e8f0" : "#0f172a",
              color: pending ? "#94a3b8" : "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
            }}
          >
            {pending ? "Lagrer…" : "Lagre produkt"}
          </button>
          <a
            href="/admin/produkter"
            style={{
              fontSize: "0.875rem",
              color: "#64748b",
              textDecoration: "none",
            }}
          >
            Avbryt
          </a>
        </div>
      </div>
    </form>
  );
}
