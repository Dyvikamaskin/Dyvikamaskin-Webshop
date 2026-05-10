import type { Metadata } from "next";
import { listCategoriesWithCounts } from "@/app/actions/category";
import { KategorierClient } from "./_KategorierClient";

export const metadata: Metadata = {
  title: "Kategorier — Admin",
};

/**
 * /admin/kategorier — Phase 0.6
 *
 * Source of truth for the category taxonomy. Tree view with product
 * counts, inline rename, parent-change (move), delete (refused if the
 * category has children or products), reorder via up/down buttons,
 * and an "Add category" form at the root and at every level.
 *
 * Server component fetches the tree once. Mutations go through the
 * Phase 0.6 server actions which call revalidatePath('/', 'layout')
 * so the storefront drawer reflects changes immediately.
 */
export default async function KategorierPage() {
  const tree = await listCategoriesWithCounts();

  return (
    <div style={{ padding: "2rem", maxWidth: "960px" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 0.25rem" }}>
          Admin
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Kategorier
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#64748b",
            marginTop: "0.5rem",
            marginBottom: 0,
          }}
        >
          Treet bestemmer storefronts kategorimeny og hvor produkter kan
          plasseres. Endringer trer i kraft umiddelbart.
        </p>
      </header>

      <KategorierClient initialTree={tree} />
    </div>
  );
}
