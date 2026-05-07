import { listProducts } from "@/lib/products";
import { getCategoryTree } from "@/lib/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { CategoryNav } from "@/components/category/CategoryNav";
import { cookies } from "next/headers";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

/**
 * Home page — product catalog landing.
 * Shows the category navigation and the first page of active products.
 */
export default async function HomePage() {
  const [{ products }, categories, cookieStore] = await Promise.all([
    listProducts({ limit: 12 }),
    getCategoryTree(),
    cookies(),
  ]);

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  return (
    <main style={{ padding: "1.5rem", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Dyvikamaskin Webshop
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "2rem" }}>
        {/* Sidebar */}
        <aside>
          <CategoryNav categories={categories} />
        </aside>

        {/* Product grid */}
        <section>
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
        </section>
      </div>
    </main>
  );
}
