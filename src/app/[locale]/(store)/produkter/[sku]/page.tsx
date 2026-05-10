import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getProductBySku } from "@/lib/products";
import { getConsumerPrice, getBusinessPrice } from "@/lib/pricing";
import { formatPrice, formatNumber } from "@/lib/formatters";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import {
  ProductCondition,
  ConditionRating,
  PartProvenance,
} from "@/app/generated/prisma/enums";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";
import type { Metadata } from "next";

// ─── Condition + provenance row (Phase 0.7) ───────────────────────────────

const CONDITION_RATING_LABEL: Record<ConditionRating, string> = {
  AS_NEW: "Som ny",
  EXCELLENT: "Utmerket",
  GOOD: "God",
  FAIR: "Akseptabel",
  POOR: "Slitt",
};

const PROVENANCE_LABEL: Record<PartProvenance, string> = {
  GENUINE: "Originaldeler",
  OEM: "OEM",
  AFTERMARKET: "Aftermarket",
};

function ratingDots(rating: ConditionRating): string {
  const order: ConditionRating[] = ["POOR", "FAIR", "GOOD", "EXCELLENT", "AS_NEW"];
  const filled = order.indexOf(rating) + 1;
  return "●".repeat(filled) + "○".repeat(5 - filled);
}

function ConditionProvenanceRow({
  condition,
  conditionRating,
  conditionNotes,
  provenance,
}: {
  condition: ProductCondition;
  conditionRating: ConditionRating | null;
  conditionNotes: string | null;
  provenance: PartProvenance;
}) {
  const isUsed = condition === ProductCondition.USED;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        marginBottom: "0.85rem",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        <span
          style={{
            padding: "0.2rem 0.65rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            background: isUsed ? "#fef3c7" : "#dcfce7",
            color: isUsed ? "#92400e" : "#166534",
            border: "1px solid",
            borderColor: isUsed ? "#fcd34d" : "#86efac",
          }}
        >
          {isUsed ? "Brukt" : "Ny"}
        </span>
        {isUsed && conditionRating ? (
          <span
            title={CONDITION_RATING_LABEL[conditionRating]}
            style={{
              padding: "0.2rem 0.65rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: "#f1f5f9",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
            }}
          >
            {ratingDots(conditionRating)}{" "}
            <span style={{ fontFamily: "inherit", letterSpacing: "normal", marginLeft: "0.25rem" }}>
              {CONDITION_RATING_LABEL[conditionRating]}
            </span>
          </span>
        ) : null}
        <Link
          href="/info/deletyper"
          title="Hva betyr Originaldeler / OEM / Aftermarket?"
          style={{
            padding: "0.2rem 0.65rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            background: "#fff",
            color: "#0f172a",
            border: "1px solid #cbd5e1",
            textDecoration: "none",
          }}
        >
          {PROVENANCE_LABEL[provenance]}
        </Link>
      </div>
      {isUsed && conditionNotes ? (
        <p
          style={{
            margin: 0,
            color: "#475569",
            fontSize: "0.8125rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "0.45rem 0.7rem",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "#0f172a" }}>Tilstandsnotat:</strong> {conditionNotes}
        </p>
      ) : null}
    </div>
  );
}

interface PageProps {
  params: Promise<{ sku: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sku } = await params;
  const product = await getProductBySku(decodeURIComponent(sku));

  if (!product) {
    return { title: "Produkt ikke funnet" };
  }

  return {
    title: `${product.name} — Dyvikamaskin`,
    description: product.shortDescription ?? undefined,
  };
}

/**
 * Product detail page — /produkter/[sku]
 */
export default async function ProductPage({ params }: PageProps) {
  const { sku } = await params;
  const [product, cookieStore] = await Promise.all([
    getProductBySku(decodeURIComponent(sku)),
    cookies(),
  ]);

  if (!product) notFound();

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  // Calculate effective price
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
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      {/* Breadcrumb */}
      <nav style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "#666" }}>
        <a href="/produkter" style={{ color: "#1d4ed8", textDecoration: "none" }}>
          Produkter
        </a>
        {product.category && (
          <>
            {" / "}
            <a
              href={`/kategori/${product.category.slug}`}
              style={{ color: "#1d4ed8", textDecoration: "none" }}
            >
              {product.category.name}
            </a>
          </>
        )}
        {" / "}
        <span>{product.name}</span>
      </nav>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        {/* Image */}
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "0.75rem",
            aspectRatio: "1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
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
            <span style={{ color: "#aaa", fontSize: "3rem" }}>📦</span>
          )}
        </div>

        {/* Product info */}
        <div>
          {product.brand && (
            <p style={{ color: "#666", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              {product.brand}
            </p>
          )}
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            {product.name}
          </h1>

          {/* Condition + provenance badges (Phase 0.7) */}
          <ConditionProvenanceRow
            condition={product.condition}
            conditionRating={product.conditionRating}
            conditionNotes={product.conditionNotes}
            provenance={product.provenance}
          />

          {product.shortDescription && (
            <p style={{ color: "#555", marginBottom: "1rem", fontSize: "0.9375rem" }}>
              {product.shortDescription}
            </p>
          )}

          {/* Price */}
          <div
            style={{
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            {customerType === "CONSUMER" ? (
              <>
                <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111" }}>
                  {formatPrice(priced.priceInc)} inkl. MVA
                </p>
                <p style={{ fontSize: "0.8125rem", color: "#666" }}>
                  hvorav MVA {priced.mvaRate.mul(100).toDecimalPlaces(0).toString()}%:{" "}
                  {formatPrice(priced.mvaAmount)}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111" }}>
                  {formatPrice(priced.priceEx)} eks. MVA
                </p>
                <p style={{ fontSize: "0.8125rem", color: "#666" }}>
                  inkl. MVA: {formatPrice(priced.priceInc)}
                </p>
              </>
            )}

            {priced.discountPct.gt(0) && (
              <p
                style={{
                  marginTop: "0.375rem",
                  fontSize: "0.8125rem",
                  color: "#16a34a",
                  fontWeight: 600,
                }}
              >
                {formatNumber(priced.discountPct, 0)}% rabatt
                {priced.discountSource === "CUSTOMER_DISCOUNT" && " (din kundepris)"}
              </p>
            )}
          </div>

          {/* Stock status */}
          <p
            style={{
              marginBottom: "1rem",
              fontWeight: 600,
              color: inStock ? "#16a34a" : "#dc2626",
            }}
          >
            {inStock
              ? `På lager (${product.totalStock} stk)`
              : "Ikke på lager"}
          </p>

          {/* Add to cart */}
          <AddToCartButton
            productId={product.id}
            sku={product.sku}
            name={product.name}
            brand={product.brand}
            mainImage={product.mainImage}
            categoryId={product.categoryId}
            minimumOrderQuantity={product.minimumOrderQuantity}
            availableStock={product.totalStock}
            initialPriceEx={priced.priceEx.toString()}
            initialPriceInc={priced.priceInc.toString()}
            initialMvaRate={priced.mvaRate.toString()}
            initialDiscountPct={priced.discountPct.toString()}
            initialDiscountSource={priced.discountSource}
          />

          {product.minimumOrderQuantity > 1 && (
            <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "#666" }}>
              Minimum bestillingsantall: {product.minimumOrderQuantity} stk
            </p>
          )}

          {/* Meta */}
          <dl
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "0.25rem 1rem",
              fontSize: "0.875rem",
              color: "#555",
            }}
          >
            <dt style={{ fontWeight: 600, color: "#374151" }}>Varenr.</dt>
            <dd style={{ margin: 0 }}>{product.sku}</dd>

            {product.partNumber && (
              <>
                <dt style={{ fontWeight: 600, color: "#374151" }}>Delenr.</dt>
                <dd style={{ margin: 0 }}>{product.partNumber}</dd>
              </>
            )}

            {product.category && (
              <>
                <dt style={{ fontWeight: 600, color: "#374151" }}>Kategori</dt>
                <dd style={{ margin: 0 }}>{product.category.name}</dd>
              </>
            )}

            {product.leadTimeDays > 0 && (
              <>
                <dt style={{ fontWeight: 600, color: "#374151" }}>Leveringstid</dt>
                <dd style={{ margin: 0 }}>
                  {product.leadTimeDays} dag{product.leadTimeDays !== 1 ? "er" : ""}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </main>
  );
}
