import { listProducts, getActiveBrands } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { cookies } from "next/headers";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

interface PageProps {
  searchParams: Promise<{
    kategori?: string;
    merke?: string;
    sok?: string;
    side?: string;
  }>;
}

/**
 * Product listing page — /produkter
 *
 * Categories live in the hamburger drawer (Phase 0.5). The static
 * left sidebar was removed in Phase 0.6 because it duplicated the
 * drawer.
 *
 * Filters (condition, provenance, brand, model, "Mine maskiner")
 * land in Phase 0.7 as a visible chip bar above the grid. Until then
 * the page still honours the existing query params (`kategori`,
 * `merke`, `sok`) — a brand chip-row appears under the search box
 * once at least one brand has been seeded so the merke= filter
 * remains usable.
 *
 * Query params:
 *   kategori  — category ID to filter by
 *   merke     — brand name
 *   sok       — free-text search
 *   side      — page number (1-based)
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const page = Math.max(1, parseInt(params.side ?? "1", 10) || 1);
  const categoryId = params.kategori;
  const brand = params.merke;
  const search = params.sok;

  const [{ products, total, totalPages }, brands, cookieStore] =
    await Promise.all([
      listProducts({ categoryId, brand, search, page }),
      getActiveBrands(categoryId),
      cookies(),
    ]);

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.25rem" }}>
        Produkter
        {total > 0 && (
          <span style={{ fontSize: "1rem", fontWeight: 400, color: "#666", marginLeft: "0.75rem" }}>
            ({total} produkter)
          </span>
        )}
      </h1>

      {/* Search form */}
      <form
        method="GET"
        style={{
          marginBottom: brands.length > 0 ? "0.75rem" : "1.5rem",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <input
          type="text"
          name="sok"
          defaultValue={search}
          placeholder="Søk etter produkt, varenr., merke..."
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
          }}
        />
        {categoryId && <input type="hidden" name="kategori" value={categoryId} />}
        {brand && <input type="hidden" name="merke" value={brand} />}
        <button
          type="submit"
          style={{
            padding: "0.5rem 1rem",
            background: "#1d4ed8",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Søk
        </button>
      </form>

      {/* Brand chip row — temporary until Phase 0.7 introduces the
          full filter bar. Hidden when no brands exist. */}
      {brands.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            fontSize: "0.85rem",
            color: "#374151",
          }}
        >
          <span style={{ fontWeight: 600, color: "#475569" }}>Merke:</span>
          {brands.map((b) => {
            const sp = new URLSearchParams();
            if (categoryId) sp.set("kategori", categoryId);
            if (search) sp.set("sok", search);
            if (b !== brand) sp.set("merke", b);
            const href = `/produkter${sp.toString() ? `?${sp}` : ""}`;
            const active = brand === b;
            return (
              <a
                key={b}
                href={href}
                style={{
                  padding: "0.2rem 0.7rem",
                  borderRadius: "9999px",
                  border: active ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                  background: active ? "#1d4ed8" : "#fff",
                  color: active ? "#fff" : "#0f172a",
                  textDecoration: "none",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {b}
              </a>
            );
          })}
          {brand && (
            <a
              href={(() => {
                const sp = new URLSearchParams();
                if (categoryId) sp.set("kategori", categoryId);
                if (search) sp.set("sok", search);
                return `/produkter${sp.toString() ? `?${sp}` : ""}`;
              })()}
              style={{ color: "#94a3b8", fontSize: "0.8rem", textDecoration: "underline" }}
            >
              Fjern filter
            </a>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <p style={{ color: "#666" }}>
          {search
            ? `Ingen produkter funnet for "${search}".`
            : "Ingen produkter tilgjengelig i denne kategorien."}
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1.25rem",
              marginBottom: "2rem",
            }}
          >
            {products.map((product) => (
              <ProductCard
                key={product.sku}
                product={product}
                customerType={customerType}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const sp = new URLSearchParams();
                if (categoryId) sp.set("kategori", categoryId);
                if (brand) sp.set("merke", brand);
                if (search) sp.set("sok", search);
                if (p > 1) sp.set("side", String(p));
                const href = `/produkter${sp.toString() ? `?${sp}` : ""}`;

                return (
                  <a
                    key={p}
                    href={href}
                    style={{
                      padding: "0.375rem 0.75rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "0.375rem",
                      background: p === page ? "#1d4ed8" : "#fff",
                      color: p === page ? "#fff" : "#374151",
                      textDecoration: "none",
                      fontSize: "0.875rem",
                      fontWeight: p === page ? 700 : 400,
                    }}
                  >
                    {p}
                  </a>
                );
              })}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
