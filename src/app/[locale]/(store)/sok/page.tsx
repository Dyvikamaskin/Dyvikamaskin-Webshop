import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { cookies } from "next/headers";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";
import type { Metadata } from "next";

/**
 * Search results — Phase 0.5
 *
 * Receives `?q=…` from the TopBar SearchBar form. Falls back to the
 * existing listProducts({ search }) helper for now (string ILIKE across
 * name/sku/partNumber/brand). Phase 5 replaces this with the new
 * pg_trgm + tsvector backend; the URL contract stays the same.
 */

export const metadata: Metadata = {
  title: "Søk — Dyvikamaskin",
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const query = (rawQ ?? "").trim();
  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);

  const cookieStore = await cookies();
  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  const result = query
    ? await listProducts({ search: query, page, limit: 24 })
    : null;

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            margin: 0,
            color: "#0f172a",
          }}
        >
          Søk
        </h1>
        {query ? (
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.95rem" }}>
            {result?.total ?? 0} treff for «{query}»
          </p>
        ) : (
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.95rem" }}>
            Skriv inn et søk i søkefeltet øverst.
          </p>
        )}
      </header>

      {result && result.products.length > 0 ? (
        <section>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {result.products.map((product) => (
              <ProductCard
                key={product.sku}
                product={product}
                customerType={customerType}
              />
            ))}
          </div>

          {result.totalPages > 1 ? (
            <nav
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                marginTop: "2rem",
                fontSize: "0.875rem",
              }}
            >
              {Array.from({ length: result.totalPages }, (_, i) => i + 1).map(
                (n) => (
                  <a
                    key={n}
                    href={`/sok?q=${encodeURIComponent(query)}&page=${n}`}
                    style={{
                      padding: "0.4rem 0.7rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      background: n === page ? "#0f172a" : "#fff",
                      color: n === page ? "#fff" : "#0f172a",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    {n}
                  </a>
                )
              )}
            </nav>
          ) : null}
        </section>
      ) : query ? (
        <p style={{ color: "#64748b" }}>
          Ingen treff. Prøv et annet søkeord.
        </p>
      ) : null}
    </main>
  );
}
