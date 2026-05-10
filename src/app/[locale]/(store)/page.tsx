import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { InfoCardsRow } from "@/components/layout/InfoCardsRow";
import { cookies } from "next/headers";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

/**
 * Home page — product catalog landing.
 *
 * Categories are reached via the hamburger drawer (Phase 0.5). The old
 * inline left-side category list was removed in Phase 0.6 because it
 * duplicated the drawer.
 */
export default async function HomePage() {
  const [{ products }, cookieStore] = await Promise.all([
    listProducts({ limit: 12 }),
    cookies(),
  ]);

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  return (
    <>
      <InfoCardsRow />
      <main
        style={{
          padding: "1.5rem",
          fontFamily: "sans-serif",
          maxWidth: "1280px",
          margin: "0 auto",
        }}
      >
        {products.length === 0 ? (
          <p style={{ color: "#666" }}>Ingen produkter tilgjengelig ennå.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1.25rem",
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
        )}
      </main>
    </>
  );
}
