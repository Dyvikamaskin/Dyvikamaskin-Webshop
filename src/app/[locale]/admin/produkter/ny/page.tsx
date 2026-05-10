import NyttProduktForm from "./_NyttProduktForm";
import { getCategoryTree, type CategoryNode } from "@/lib/categories";

/** Flatten the category tree into pickable rows with full slash-paths. */
function flatten(nodes: CategoryNode[], parentPath: string[] = []): { id: string; name: string; path: string }[] {
  const out: { id: string; name: string; path: string }[] = [];
  for (const node of nodes) {
    const path = [...parentPath, node.slug].join("/");
    out.push({ id: node.id, name: node.name, path });
    if (node.children.length) {
      out.push(...flatten(node.children, [...parentPath, node.slug]));
    }
  }
  return out;
}

export default async function NyttProduktPage() {
  const tree = await getCategoryTree();
  const categories = flatten(tree);

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
          Etter lagring kjøres <strong>produktberikelse</strong> (navn, merke, beskrivelse) og{" "}
          <strong>tilpasningsforslag</strong> automatisk i bakgrunnen.
          Tomme felter fylles inn — du kan redigere etterpå.
        </p>
      </div>

      <NyttProduktForm categories={categories} />
    </div>
  );
}
