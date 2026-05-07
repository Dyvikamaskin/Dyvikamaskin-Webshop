import { listProducts, getActiveBrands } from "@/lib/products";
import { getCategoryTree } from "@/lib/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { CategoryNav } from "@/components/category/CategoryNav";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
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

  const [{ products, total, totalPages }, categories, brands, cookieStore] =
    await Promise.all([
      listProducts({ categoryId, brand, search, page }),
      getCategoryTree(),
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
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Produkter
        {total > 0 && (
          <span style={{ fontSize: "1rem", fontWeight: 400, color: "#666", marginLeft: "0.75rem" }}>
            ({total} produkter)
          </span>
        )}
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "2rem" }}>
        {/* Sidebar */}
        <aside>
          <CategoryNav categories={categories} activeCategoryId={categoryId} />

          {brands.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.5rem", color: "#444" }}>
                MERKE
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {brands.map((b) => (
                  <li key={b} style={{ marginBottom: "0.25rem" }}>
                    <a
                      href={`/produkter?merke=${encodeURIComponent(b)}${categoryId ? `&kategori=${categoryId}` : ""}`}
                      style={{
                        color: brand === b ? "#1d4ed8" : "#374151",
                        fontWeight: brand === b ? 700 : 400,
                        textDecoration: "none",
                        fontSize: "0.875rem",
                      }}
                    >
                      {b}
                    </a>
                  </li>
                ))}
                {brand && (
                  <li style={{ marginTop: "0.5rem" }}>
                    <a
                      href={`/produkter${categoryId ? `?kategori=${categoryId}` : ""}`}
                      style={{ color: "#999", fontSize: "0.8rem", textDecoration: "underline" }}
                    >
                      Fjern filter
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </aside>

        {/* Product grid */}
        <section>
          {/* Search form */}
          <form method="GET" style={{ marginBottom: "1.25rem", display: "flex", gap: "0.5rem" }}>
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
                    const params = new URLSearchParams();
                    if (categoryId) params.set("kategori", categoryId);
                    if (brand) params.set("merke", brand);
                    if (search) params.set("sok", search);
                    if (p > 1) params.set("side", String(p));
                    const href = `/produkter${params.toString() ? `?${params}` : ""}`;

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
        </section>
      </div>
    </main>
  );
}
