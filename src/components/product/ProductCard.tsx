import Link from "next/link";
import { getConsumerPrice, getBusinessPrice } from "@/lib/pricing";
import { formatPrice } from "@/lib/formatters";
import type { ProductWithStock } from "@/lib/products";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

interface ProductCardProps {
  product: ProductWithStock;
  customerType: CustomerTypeValue;
}

/**
 * Product card — used in the product listing and home page grid.
 * Inline styles; Tailwind applied in Phase 5 UI pass.
 */
export function ProductCard({ product, customerType }: ProductCardProps) {
  const priced =
    customerType === "BUSINESS"
      ? getBusinessPrice(product.priceBase, product.mvaRate, product.id, product.sku, {
          categoryId: product.categoryId,
          brand: product.brand,
        })
      : getConsumerPrice(product.priceBase, product.mvaRate, product.id, product.sku, {
          categoryId: product.categoryId,
          brand: product.brand,
        });

  const inStock = product.totalStock > 0;

  return (
    <Link
      href={`/produkter/${encodeURIComponent(product.sku)}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <article
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          padding: "1rem",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          transition: "box-shadow 0.15s",
          cursor: "pointer",
          height: "100%",
        }}
      >
        {/* Image */}
        <div
          style={{
            background: "#f9fafb",
            borderRadius: "0.375rem",
            aspectRatio: "1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            marginBottom: "0.25rem",
          }}
        >
          {product.mainImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.mainImage}
              alt={product.name}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: "2rem", color: "#d1d5db" }}>📦</span>
          )}
        </div>

        {/* Brand */}
        {product.brand && (
          <span style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 500 }}>
            {product.brand}
          </span>
        )}

        {/* Name */}
        <p
          style={{
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "#111",
            flexGrow: 1,
            lineHeight: 1.4,
          }}
        >
          {product.name}
        </p>

        {/* SKU */}
        <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
          Varenr. {product.sku}
        </span>

        {/* Price */}
        <div>
          <p style={{ fontWeight: 700, fontSize: "1rem", color: "#111" }}>
            {customerType === "CONSUMER"
              ? `${formatPrice(priced.priceInc)} inkl. MVA`
              : `${formatPrice(priced.priceEx)} eks. MVA`}
          </p>
          {priced.discountPct.gt(0) && (
            <p style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
              {priced.discountPct.toDecimalPlaces(0).toString()}% rabatt
            </p>
          )}
        </div>

        {/* Stock badge */}
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: inStock ? "#16a34a" : "#dc2626",
          }}
        >
          {inStock ? "På lager" : "Ikke på lager"}
        </span>
      </article>
    </Link>
  );
}
