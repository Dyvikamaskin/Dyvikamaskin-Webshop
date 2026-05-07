import ImportForm from "./_ImportForm";

export default function ImporterPage() {
  return (
    <div style={{ padding: "2rem", maxWidth: "860px" }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 0.25rem" }}>
          Produkter / Importer CSV
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Importer produkter fra CSV
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#64748b",
            marginTop: "0.5rem",
            marginBottom: 0,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "6px",
            padding: "0.6rem 0.9rem",
          }}
        >
          ✨ For hvert importert produkt kjøres <strong>produktberikelse</strong> og{" "}
          <strong>tilpasningsforslag</strong> automatisk i bakgrunnen.
          Eksisterende SKU-er hoppes over.
        </p>
      </div>

      <ImportForm />
    </div>
  );
}
