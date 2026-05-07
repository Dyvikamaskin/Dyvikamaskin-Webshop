"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProductAction } from "@/app/actions/product";

interface Category {
  id:   string;
  name: string;
  slug: string;
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
  const [pending, setPending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);

    const result = await createProductAction({
      sku:              (fd.get("sku")              as string).trim(),
      name:             (fd.get("name")             as string).trim(),
      priceBase:        parseFloat(fd.get("priceBase") as string),
      brand:            (fd.get("brand")            as string) || undefined,
      shortDescription: (fd.get("shortDescription") as string) || undefined,
      partNumber:       (fd.get("partNumber")       as string) || undefined,
      categoryId:       (fd.get("categoryId")       as string) || undefined,
      mvaRate:          parseFloat(fd.get("mvaRate") as string) || 0.25,
      isActive:         fd.get("isActive") !== "false",
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error ?? "Noe gikk galt.");
      return;
    }

    router.push(`/admin/produkter/${encodeURIComponent(result.sku!)}/rediger`);
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
            placeholder="f.eks. Hydraulikkslange 1/2\""
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

        {/* Kategori */}
        <div>
          <label htmlFor="categoryId" style={labelStyle}>Kategori</label>
          <select id="categoryId" name="categoryId" style={inputStyle} defaultValue="">
            <option value="">— Ingen kategori —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
