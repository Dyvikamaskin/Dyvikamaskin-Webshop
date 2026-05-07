"use client";

import { useEffect, useState, useTransition } from "react";
import { useCartStore } from "@/lib/stores/use-cart";
import { validateCartAction } from "@/app/actions/cart";
import { formatPrice, formatNumber } from "@/lib/formatters";
import type { ValidatedCart } from "@/lib/cart";
import Link from "next/link";
import { CheckoutButton } from "@/components/cart/CheckoutButton";

/**
 * Client-side cart content component.
 * Reads from Zustand, re-validates with the server on mount to get
 * fresh pricing and stock info.
 */
export function CartContent() {
  const { items, removeItem, updateQuantity, applyPricingUpdate, clearCart } =
    useCartStore();

  const [validated, setValidated] = useState<ValidatedCart | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasHydrated, setHasHydrated] = useState(false);

  // Wait for Zustand persist to rehydrate before rendering
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Re-validate cart on mount and whenever items change
  useEffect(() => {
    if (!hasHydrated || items.length === 0) {
      setValidated(null);
      return;
    }

    startTransition(async () => {
      try {
        const result = await validateCartAction(
          items.map((i) => ({ sku: i.sku, quantity: i.quantity }))
        );
        setValidated(result);

        // Apply server-side pricing updates to Zustand store
        applyPricingUpdate(
          result.items.map((vi) => ({
            sku: vi.sku,
            priceEx: vi.priceEx,
            priceInc: vi.priceInc,
            mvaRate: vi.mvaRate,
            discountPct: vi.discountPct,
            discountSource: vi.discountSource,
            promotionId: vi.promotionId,
          }))
        );
      } catch {
        // Fallback: use local Zustand data without server validation
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, items.length]);

  if (!hasHydrated) return null;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <p style={{ fontSize: "1.125rem", color: "#666", marginBottom: "1rem" }}>
          Handlekurven er tom.
        </p>
        <Link
          href="/produkter"
          style={{
            display: "inline-block",
            padding: "0.625rem 1.25rem",
            background: "#1d4ed8",
            color: "#fff",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Se produkter
        </Link>
      </div>
    );
  }

  // Build a uniform display shape from either server-validated or local data
  type DisplayItem = {
    sku: string; name: string; brand: string | null; mainImage: string | null;
    quantity: number; minimumOrderQuantity: number;
    priceEx: number; priceInc: number; mvaRate: number;
    discountPct: number; discountSource: string; promotionId?: string;
    lineTotalEx: number; lineTotalInc: number;
    availableStock: number; stockWarning: boolean;
    storeStock: { storeId: string; storeName: string; quantity: number }[];
  };

  const displayItems: DisplayItem[] = validated?.items ?? items.map((i) => ({
    ...i,
    lineTotalEx: i.priceEx * i.quantity,
    lineTotalInc: i.priceInc * i.quantity,
    availableStock: 0,
    stockWarning: false,
    storeStock: [],
  }));

  const grandTotalInc =
    validated?.grandTotalInc ??
    items.reduce((s, i) => s + i.priceInc * i.quantity, 0);
  const grandTotalEx =
    validated?.grandTotalEx ??
    items.reduce((s, i) => s + i.priceEx * i.quantity, 0);
  const grandMva =
    validated?.grandMvaAmount ?? grandTotalInc - grandTotalEx;

  return (
    <div>
      {/* Multi-store warning */}
      {validated?.isMultiStore && (
        <div
          style={{
            background: "#fef9c3",
            border: "1px solid #fde047",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            color: "#713f12",
          }}
        >
          ⚠ Varer fra flere lagre — frakt beregnes separat per lager.
        </div>
      )}

      {/* Stock warnings */}
      {validated?.hasStockWarnings && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            color: "#991b1b",
          }}
        >
          ⚠ Noen varer har ikke tilstrekkelig lagerbeholdning.
        </div>
      )}

      {/* Items table */}
      <div style={{ marginBottom: "1.5rem" }}>
        {displayItems.map((item) => (
          <div
            key={item.sku}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr auto",
              gap: "1rem",
              alignItems: "center",
              padding: "0.875rem 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            {/* Image */}
            <div
              style={{
                width: 56,
                height: 56,
                background: "#f9fafb",
                borderRadius: "0.375rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {item.mainImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.mainImage}
                  alt={item.name}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <span style={{ fontSize: "1.5rem", color: "#d1d5db" }}>📦</span>
              )}
            </div>

            {/* Name + quantity */}
            <div>
              <Link
                href={`/produkter/${encodeURIComponent(item.sku)}`}
                style={{ fontWeight: 600, color: "#111", textDecoration: "none", fontSize: "0.9375rem" }}
              >
                {item.name}
              </Link>
              {item.brand && (
                <p style={{ fontSize: "0.8125rem", color: "#9ca3af", margin: "0.125rem 0" }}>
                  {item.brand}
                </p>
              )}
              <p style={{ fontSize: "0.8125rem", color: "#9ca3af", marginBottom: "0.5rem" }}>
                Varenr. {item.sku}
              </p>

              {"stockWarning" in item && item.stockWarning && (
                <p style={{ fontSize: "0.8125rem", color: "#dc2626", marginBottom: "0.375rem" }}>
                  ⚠ Kun {"availableStock" in item ? item.availableStock : "?"} på lager
                </p>
              )}

              {/* Quantity controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  onClick={() => updateQuantity(item.sku, item.quantity - 1)}
                  style={qtyBtnStyle}
                  aria-label="Reduser antall"
                >
                  −
                </button>
                <span style={{ minWidth: "2rem", textAlign: "center", fontSize: "0.9375rem", fontWeight: 600 }}>
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.sku, item.quantity + 1)}
                  style={qtyBtnStyle}
                  aria-label="Øk antall"
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(item.sku)}
                  style={{
                    marginLeft: "0.5rem",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    padding: "0.25rem",
                  }}
                >
                  Fjern
                </button>
              </div>
            </div>

            {/* Line total */}
            <div style={{ textAlign: "right", minWidth: "6rem" }}>
              <p style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#111" }}>
                {formatPrice(item.lineTotalInc)}
              </p>
              <p style={{ fontSize: "0.8125rem", color: "#666" }}>
                {formatPrice(item.priceInc)} / stk
              </p>
              {item.discountPct > 0 && (
                <p style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                  {formatNumber(item.discountPct, 0)}% rabatt
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Store splits (multi-store summary) */}
        <div>
          {validated?.splits.map((split) => (
            <div
              key={split.storeId}
              style={{
                marginBottom: "0.75rem",
                padding: "0.75rem",
                background: "#f9fafb",
                borderRadius: "0.5rem",
                border: "1px solid #e5e7eb",
                fontSize: "0.875rem",
              }}
            >
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                🏪 {split.storeName}
              </p>
              <p style={{ color: "#555" }}>
                {split.items.length} vare{split.items.length !== 1 ? "r" : ""} ·{" "}
                {formatPrice(split.totalInc)} inkl. MVA
              </p>
            </div>
          ))}

          <button
            onClick={clearCart}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              fontSize: "0.875rem",
              padding: 0,
              textDecoration: "underline",
              marginTop: "0.5rem",
            }}
          >
            Tøm handlekurv
          </button>
        </div>

        {/* Order total */}
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "0.5rem",
            padding: "1.25rem",
          }}
        >
          <h2 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "1rem" }}>
            Ordresammendrag
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            <div style={summaryRow}>
              <span>Subtotal eks. MVA</span>
              <span>{formatPrice(grandTotalEx)}</span>
            </div>
            <div style={summaryRow}>
              <span>MVA</span>
              <span>{formatPrice(grandMva)}</span>
            </div>
            <div
              style={{
                ...summaryRow,
                borderTop: "1px solid #e5e7eb",
                paddingTop: "0.5rem",
                fontWeight: 700,
                fontSize: "1rem",
              }}
            >
              <span>Totalt inkl. MVA</span>
              <span>{formatPrice(grandTotalInc)}</span>
            </div>
          </div>

          {/* Checkout — Vipps ePayment */}
          <CheckoutButton
            items={items}
            hasStockWarnings={validated?.hasStockWarnings ?? false}
          />

          {isPending && (
            <p style={{ textAlign: "center", marginTop: "0.5rem", fontSize: "0.8125rem", color: "#9ca3af" }}>
              Oppdaterer priser...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared inline styles ─────────────────────────────────────────────────────

const qtyBtnStyle: React.CSSProperties = {
  width: "1.75rem",
  height: "1.75rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  background: "#fff",
  cursor: "pointer",
  fontSize: "1rem",
  fontWeight: 700,
  color: "#374151",
};

const summaryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.9375rem",
  color: "#374151",
};
