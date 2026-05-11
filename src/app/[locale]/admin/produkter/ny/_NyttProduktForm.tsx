"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProductAction, uploadProductImageAction } from "@/app/actions/product";
import { CategoryPicker } from "@/components/admin/CategoryPicker";
import {
  ProductCondition,
  ConditionRating,
  PartProvenance,
} from "@/app/generated/prisma/enums";

interface Category {
  id:   string;
  name: string;
  /** Full slash-path from root, e.g. "verktoy/elektroverktoy". */
  path: string;
}

interface Props {
  categories: Category[];
}

const RATING_LABELS: Record<ConditionRating, string> = {
  AS_NEW: "Som ny",
  EXCELLENT: "Utmerket",
  GOOD: "God",
  FAIR: "Akseptabel",
  POOR: "Slitt",
};

const PROVENANCE_LABELS: Record<PartProvenance, string> = {
  GENUINE: "Originaldeler",
  OEM: "OEM-deler",
  AFTERMARKET: "Uoriginale deler / Aftermarket",
};

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
  const [condition,           setCondition]           = useState<ProductCondition>(ProductCondition.NEW);
  const [provenance,          setProvenance]          = useState<PartProvenance>(PartProvenance.AFTERMARKET);
  // ── Admin-only metadata (tags surface as <meta keywords> only) ────────
  const [tags,                setTags]                = useState<string[]>([]);
  const [tagInput,            setTagInput]            = useState("");
  const [mainImageUrl,        setMainImageUrl]        = useState("");
  // Gallery images shown on the PDP after mainImage. Each entry is a
  // URL (typed or returned by uploadProductImageAction).
  const [galleryImages,       setGalleryImages]       = useState<string[]>([]);
  const [galleryUrlInput,     setGalleryUrlInput]     = useState("");
  const [uploadingImage,      setUploadingImage]      = useState(false);
  const [uploadingGallery,    setUploadingGallery]    = useState(false);
  const [imageError,          setImageError]          = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);

    const ratingRaw = fd.get("conditionRating") as string | null;
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
      condition,
      conditionRating: condition === ProductCondition.USED && ratingRaw
        ? (ratingRaw as ConditionRating)
        : null,
      conditionNotes: (fd.get("conditionNotes") as string) || undefined,
      provenance,
      // ── Admin-only metadata ──
      purchasePrice: fd.get("purchasePrice")
        ? parseFloat(fd.get("purchasePrice") as string)
        : undefined,
      tags,
      hiddenDescription: (fd.get("hiddenDescription") as string) || undefined,
      mainImage: mainImageUrl.trim() || undefined,
      galleryImages: galleryImages.length > 0 ? galleryImages : undefined,
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

  function addTag() {
    const val = tagInput.trim();
    if (!val) return;
    if (!tags.includes(val)) setTags((prev) => [...prev, val]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    setImageError(null);
    const fd = new FormData();
    fd.append("file", file);
    // SKU may not be set yet — server action falls back to "noSku" prefix.
    const skuInput = document.getElementById("sku") as HTMLInputElement | null;
    if (skuInput?.value) fd.append("sku", skuInput.value);
    const result = await uploadProductImageAction(fd);
    setUploadingImage(false);
    if (!result.ok) {
      setImageError(result.error);
      return;
    }
    setMainImageUrl(result.url);
  }

  function addGalleryUrl() {
    const v = galleryUrlInput.trim();
    if (!v) return;
    if (!galleryImages.includes(v)) {
      setGalleryImages((prev) => [...prev, v]);
    }
    setGalleryUrlInput("");
  }

  function removeGalleryImage(url: string) {
    setGalleryImages((prev) => prev.filter((u) => u !== url));
  }

  async function handleGalleryUpload(file: File) {
    setUploadingGallery(true);
    setImageError(null);
    const fd = new FormData();
    fd.append("file", file);
    const skuInput = document.getElementById("sku") as HTMLInputElement | null;
    if (skuInput?.value) fd.append("sku", skuInput.value);
    const result = await uploadProductImageAction(fd);
    setUploadingGallery(false);
    if (!result.ok) {
      setImageError(result.error);
      return;
    }
    if (!galleryImages.includes(result.url)) {
      setGalleryImages((prev) => [...prev, result.url]);
    }
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

        {/* Tilstand (Phase 0.7) */}
        <div>
          <label style={labelStyle}>Tilstand</label>
          <div style={{ display: "flex", gap: "1rem" }}>
            {(Object.values(ProductCondition) as ProductCondition[]).map((c) => (
              <label key={c} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="condition"
                  value={c}
                  checked={condition === c}
                  onChange={() => setCondition(c)}
                />
                {c === "NEW" ? "Ny" : "Brukt"}
              </label>
            ))}
          </div>
        </div>

        {condition === ProductCondition.USED && (
          <>
            <div>
              <label htmlFor="conditionRating" style={labelStyle}>Tilstandsgrad *</label>
              <select
                id="conditionRating"
                name="conditionRating"
                style={inputStyle}
                defaultValue=""
                required
              >
                <option value="">— Velg —</option>
                {(Object.values(ConditionRating) as ConditionRating[]).map((r) => (
                  <option key={r} value={r}>
                    {RATING_LABELS[r]}
                  </option>
                ))}
              </select>
              <p style={hintStyle}>Påkrevd når tilstand er Brukt.</p>
            </div>
            <div>
              <label htmlFor="conditionNotes" style={labelStyle}>Tilstandsnotat</label>
              <textarea
                id="conditionNotes"
                name="conditionNotes"
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                placeholder="F.eks. mindre riper i lakk, full funksjonalitet"
              />
            </div>
          </>
        )}

        {/* Opphav (Phase 0.7) */}
        <div>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            Opphav
            <a
              href="/info/deletyper"
              target="_blank"
              rel="noopener"
              title="Hva betyr Originaldeler / OEM / Aftermarket?"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1rem",
                height: "1rem",
                borderRadius: "50%",
                background: "#e2e8f0",
                color: "#475569",
                fontSize: "0.7rem",
                fontWeight: 700,
                textDecoration: "none",
                fontFamily: "serif",
              }}
            >
              i
            </a>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {(Object.values(PartProvenance) as PartProvenance[]).map((p) => (
              <label key={p} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="provenance"
                  value={p}
                  checked={provenance === p}
                  onChange={() => setProvenance(p)}
                />
                {PROVENANCE_LABELS[p]}
              </label>
            ))}
          </div>
        </div>

        {/* ─── Bilder (synlig på produktsiden) ──────────────────────────── */}
        <fieldset
          style={{
            margin: "0.5rem 0",
            padding: "1rem 1.25rem",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
          }}
        >
          <legend
            style={{
              padding: "0 0.5rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Bilder — synlig på produktsiden
          </legend>

          {/* Hovedbilde — URL eller opplasting */}
          <div style={{ marginTop: "0.5rem" }}>
            <label htmlFor="mainImage" style={labelStyle}>Hovedbilde</label>
            <input
              id="mainImage"
              type="text"
              value={mainImageUrl}
              onChange={(e) => setMainImageUrl(e.target.value)}
              placeholder="https://leverandor.no/.../bilde.jpg"
              style={inputStyle}
            />
            <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.4rem 0.8rem",
                  background: uploadingImage ? "#e2e8f0" : "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: uploadingImage ? "default" : "pointer",
                  color: "#0f172a",
                }}
              >
                {uploadingImage ? "Laster opp …" : "Eller last opp fil"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploadingImage}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImageUpload(f);
                  }}
                  style={{ display: "none" }}
                />
              </label>
              {mainImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mainImageUrl}
                  alt=""
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: "cover",
                    borderRadius: 4,
                    border: "1px solid #e2e8f0",
                  }}
                />
              ) : null}
            </div>
            <p style={hintStyle}>
              Lim inn URL fra leverandørens bildebank, eller last opp en fil
              (JPEG / PNG / WebP / GIF, maks 10 MB).
            </p>
          </div>

          {/* Galleribilder */}
          <div style={{ marginTop: "1.25rem" }}>
            <label style={labelStyle}>Galleribilder</label>
            {galleryImages.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                {galleryImages.map((url) => (
                  <div
                    key={url}
                    style={{
                      position: "relative",
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      border: "1px solid #e2e8f0",
                      overflow: "hidden",
                      background: "#f8fafc",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(url)}
                      aria-label="Fjern bilde"
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 20,
                        height: 20,
                        background: "rgba(15,23,42,0.85)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "50%",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <input
                type="text"
                value={galleryUrlInput}
                onChange={(e) => setGalleryUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addGalleryUrl(); }
                }}
                placeholder="URL til ekstra produktbilde"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={addGalleryUrl}
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
                + Legg til URL
              </button>
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.4rem 0.8rem",
                background: uploadingGallery ? "#e2e8f0" : "#fff",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: uploadingGallery ? "default" : "pointer",
                color: "#0f172a",
              }}
            >
              {uploadingGallery ? "Laster opp …" : "Eller last opp fil"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploadingGallery}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleGalleryUpload(f);
                  // Reset so the same file can be re-selected later.
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
            <p style={hintStyle}>
              Tilleggsbilder vises som miniatyrer under hovedbildet på
              produktsiden. Klikk på en miniatyr for å bytte hovedbilde.
            </p>
            {imageError ? (
              <p style={{ marginTop: "0.4rem", color: "#dc2626", fontSize: "0.8rem" }}>
                {imageError}
              </p>
            ) : null}
          </div>
        </fieldset>

        {/* ─── Intern data — skjult fra butikken ────────────────────────── */}
        <fieldset
          style={{
            margin: "0.5rem 0",
            padding: "1rem 1.25rem",
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: "8px",
          }}
        >
          <legend
            style={{
              padding: "0 0.5rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Intern data — skjult fra butikken
          </legend>

          {/* Innkjøpspris */}
          <div style={{ marginTop: "0.5rem" }}>
            <label htmlFor="purchasePrice" style={labelStyle}>Innkjøpspris ekskl. MVA (kr)</label>
            <input
              id="purchasePrice"
              name="purchasePrice"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              style={{ ...inputStyle, maxWidth: "200px" }}
            />
            <p style={hintStyle}>
              Din inn-pris hos leverandør. Brukes til margin-rapport. Aldri
              synlig for kunder.
            </p>
          </div>

          {/* Interne tagger */}
          <div style={{ marginTop: "1rem" }}>
            <label style={labelStyle}>Interne tagger</label>
            {tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.4rem" }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.2rem 0.55rem",
                      background: "#e0e7ff",
                      border: "1px solid #c7d2fe",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                      color: "#1e1b4b",
                    }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                        color: "#475569",
                        fontSize: "0.9rem",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(); }
                }}
                placeholder="f.eks. sesong-2025, kampanje-Q3"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={addTag}
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
            <p style={hintStyle}>
              Intern kategorisering — vises ikke som tekst i butikken, men
              eksponeres som <code>&lt;meta name=&quot;keywords&quot;&gt;</code> og JSON-LD-stikkord
              slik at søkemotorer kan finne produktet via interne synonymer.
            </p>
          </div>

          {/* Skjult beskrivelse */}
          <div style={{ marginTop: "1rem" }}>
            <label htmlFor="hiddenDescription" style={labelStyle}>
              Skjult beskrivelse / interne notater
            </label>
            <textarea
              id="hiddenDescription"
              name="hiddenDescription"
              rows={3}
              placeholder="F.eks. leverandørs eiendomheter, plukk-instruksjoner, garanti-detaljer"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            <p style={hintStyle}>
              Synlig kun for admin. Ikke samme som offentlig &quot;Kort
              beskrivelse&quot; over.
            </p>
          </div>
        </fieldset>

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
