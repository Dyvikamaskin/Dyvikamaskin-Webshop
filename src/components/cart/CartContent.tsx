"use client";

import { useEffect, useState, useTransition } from "react";
// decimal.js directly — `Prisma.Decimal` is the same library, but the
// generated Prisma client export pulls server-only Node modules
// (node:module) that Turbopack rejects in client bundles.
import Decimal from "decimal.js";
import { useCartStore } from "@/lib/stores/use-cart";
import { validateCartAction } from "@/app/actions/cart";
import { formatPrice, formatNumber } from "@/lib/formatters";
import type { ValidatedCart } from "@/lib/cart";
import Link from "next/link";
import { CheckoutButton } from "@/components/cart/CheckoutButton";

const D = Decimal;

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

  // Build a uniform display shape from either server-validated or local data.
  // Money fields are decimal-formatted strings end-to-end.
  type DisplayItem = {
    sku: string; name: string; brand: string | null; mainImage: string | null;
    quantity: number; minimumOrderQuantity: number;
    priceEx: string; priceInc: string; mvaRate: string;
    discountPct: string; discountSource: string; promotionId?: string;
    lineTotalEx: string; lineTotalInc: string;
    availableStock: number; stockWarning: boolean;
    storeStock: { storeId: string; storeName: string; quantity: number }[];
  };

  const displayItems: DisplayItem[] =
    validated?.items ??
    items.map((i) => ({
      ...i,
      lineTotalEx: new D(i.priceEx).mul(i.quantity).toString(),
      lineTotalInc: new D(i.priceInc).mul(i.quantity).toString(),
      availableStock: 0,
      stockWarning: false,
      storeStock: [],
    }));

  const fallbackEx = items.reduce(
    (sum, i) => sum.plus(new D(i.priceEx).mul(i.quantity)),
    new D(0),
  );
  const fallbackInc = items.reduce(
    (sum, i) => sum.plus(new D(i.priceInc).mul(i.quantity)),
    new D(0),
  );

  const grandTotalEx = validated?.grandTotalEx ?? fallbackEx.toString();
  const grandTotalInc = validated?.grandTotalInc ?? fallbackInc.toString();
  const grandMva =
    validated?.grandMvaAmount ?? fallbackInc.minus(fallbackEx).toString();

  // Phase 8 — backorder warning. Any item without immediate stock at the
  // assigned store triggers the banner, since the order will dispatch when
  // the upstream restocks.
  const hasBackorder = (validated?.items ?? []).some(
    (i) => i.stockWarning,
  );

  return (
    <div>
      {/* Phase 8 — backorder banner */}
      {hasBackorder && (
        <div
          style={{
            background: "#dbeafe",
            border: "1px solid #93c5fd",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            color: "#1e3a8a",
          }}
        >
          ⓘ Én eller flere varer er på restordre. Vi sender ordren når
          alle varene er tilgjengelige.
        </div>
      )}

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
              {new D(item.discountPct).gt(0) && (
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
