import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { resolveCategoryPath, getCategoryTree } from "@/lib/categories";
import { listProducts, getActiveBrands } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { CategoryNav } from "@/components/category/CategoryNav";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string[]; locale: string }>;
  searchParams: Promise<{ merke?: string; side?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await resolveCategoryPath(slug);

  if (!category) return { title: "Kategori ikke funnet" };

  return {
    title: `${category.name} — Dyvikamaskin`,
    description: `Se alle produkter i kategorien ${category.name}`,
  };
}

/**
 * Category page — /kategori/[...slug]
 * e.g. /kategori/maskiner/boremaskiner
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.side ?? "1", 10) || 1);
  const brand = sp.merke;

  const [category, categories, cookieStore] = await Promise.all([
    resolveCategoryPath(slug),
    getCategoryTree(),
    cookies(),
  ]);

  if (!category) notFound();

  const [{ products, total, totalPages }, brands] = await Promise.all([
    listProducts({ categoryId: category.id, brand, page }),
    getActiveBrands(category.id),
  ]);

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  const basePath = `/kategori/${slug.join("/")}`;

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        {category.name}
      </h1>
      {total > 0 && (
        <p style={{ color: "#666", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          {total} produkt{total !== 1 ? "er" : ""}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "2rem" }}>
        {/* Sidebar */}
        <aside>
          <CategoryNav categories={categories} activeCategoryId={category.id} />

          {brands.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  marginBottom: "0.5rem",
                  color: "#444",
                }}
              >
                MERKE
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {brands.map((b) => (
                  <li key={b} style={{ marginBottom: "0.25rem" }}>
                    <a
                      href={`${basePath}?merke=${encodeURIComponent(b)}`}
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
                      href={basePath}
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
          {products.length === 0 ? (
            <p style={{ color: "#666" }}>Ingen produkter i denne kategorien.</p>
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
                    const qp = new URLSearchParams();
                    if (brand) qp.set("merke", brand);
                    if (p > 1) qp.set("side", String(p));
                    const href = `${basePath}${qp.toString() ? `?${qp}` : ""}`;

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
