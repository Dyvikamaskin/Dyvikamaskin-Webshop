import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { resolveCategoryPath } from "@/lib/categories";
import { listProducts, getActiveBrands } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
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
 *
 * Sub-categories live in the hamburger drawer (Phase 0.5). The static
 * category sidebar was removed in Phase 0.6. A brand chip row
 * appears under the heading until Phase 0.7's full filter bar lands.
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.side ?? "1", 10) || 1);
  const brand = sp.merke;

  const [category, cookieStore] = await Promise.all([
    resolveCategoryPath(slug),
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
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        {category.name}
      </h1>
      {total > 0 && (
        <p style={{ color: "#666", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {total} produkt{total !== 1 ? "er" : ""}
        </p>
      )}

      {/* Brand chip row — temporary until Phase 0.7 introduces the
          full filter bar. */}
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
            const active = brand === b;
            const qp = new URLSearchParams();
            if (b !== brand) qp.set("merke", b);
            const href = `${basePath}${qp.toString() ? `?${qp}` : ""}`;
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
              href={basePath}
              style={{ color: "#94a3b8", fontSize: "0.8rem", textDecoration: "underline" }}
            >
              Fjern filter
            </a>
          )}
        </div>
      )}

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
    </main>
  );
}
