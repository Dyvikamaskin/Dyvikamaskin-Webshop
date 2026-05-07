"use client";

import { useState, useTransition } from "react";
import { approveDraftAction } from "@/app/actions/product-draft";

interface Props {
  draftId:     string;
  initialSku:  string;
  initialName: string;
  initialBrand: string;
  initialDesc:  string;
  categories: { id: string; name: string; parentId: string | null }[];
}

export default function ApproveForm({
  draftId, initialSku, initialName, initialBrand, initialDesc, categories,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [sku,        setSku]        = useState(initialSku);
  const [name,       setName]       = useState(initialName);
  const [brand,      setBrand]      = useState(initialBrand);
  const [desc,       setDesc]       = useState(initialDesc);
  const [price,      setPrice]      = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error,      setError]      = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceNum = parseFloat(price);
    if (!sku.trim() || !name.trim()) { setError("SKU og navn er påkrevd."); return; }
    if (isNaN(priceNum) || priceNum <= 0) { setError("Ugyldig pris."); return; }

    startTransition(async () => {
      const result = await approveDraftAction(draftId, {
        sku:             sku.trim(),
        name:            name.trim(),
        brand:           brand.trim() || null,
        shortDescription: desc.trim() || null,
        priceBase:       priceNum,
        categoryId:      categoryId || null,
      });
      if (!result.ok) { setError(result.error); return; }
      window.location.href = "/admin/produktforslag";
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: "8px", padding: "1.25rem" }}>
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.9rem", fontWeight: 700, color: "#166534" }}>
        ✓ Godkjenn og opprett produkt
      </h3>

      {error && (
        <p style={{ margin: "0 0 0.75rem", padding: "0.5rem 0.75rem", background: "#fef2f2", color: "#dc2626", borderRadius: "6px", fontSize: "0.8rem" }}>
          {error}
        </p>
      )}

      <Label text="SKU *">
        <input value={sku} onChange={(e) => setSku(e.target.value)} required style={inputStyle} />
      </Label>
      <Label text="Navn *">
        <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
      </Label>
      <Label text="Merke">
        <input value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle} />
      </Label>
      <Label text="Kort beskrivelse">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </Label>
      <Label text="Grunnpris (ekskl. MVA) *">
        <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="0.00" style={inputStyle} />
      </Label>
      <Label text="Kategori">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
          <option value="">— Velg kategori —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.parentId ? "  └ " : ""}{c.name}</option>
          ))}
        </select>
      </Label>

      <button
        type="submit"
        disabled={isPending}
        style={{ width: "100%", marginTop: "0.5rem", padding: "0.625rem", background: isPending ? "#86efac" : "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
      >
        {isPending ? "Oppretter produkt…" : "Godkjenn og opprett"}
      </button>
    </form>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}>
      {text}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
