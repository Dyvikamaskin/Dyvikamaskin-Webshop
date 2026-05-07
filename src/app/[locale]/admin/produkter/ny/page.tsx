import { prisma } from "@/lib/prisma";
import NyttProduktForm from "./_NyttProduktForm";

export default async function NyttProduktPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "640px" }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 0.25rem" }}>
          Produkter / Nytt produkt
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Legg til nytt produkt
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
          ✨ Etter lagring kjøres <strong>produktberikelse</strong> (navn, merke, beskrivelse) og{" "}
          <strong>tilpasningsforslag</strong> automatisk i bakgrunnen.
          Tomme felter fylles inn — du kan redigere etterpå.
        </p>
      </div>

      <NyttProduktForm categories={categories} />
    </div>
  );
}
