"use client";

import { useTransition, useState } from "react";
import { initiateCheckoutAction } from "@/app/actions/checkout";
import type { CartItem } from "@/lib/stores/use-cart";

interface CheckoutButtonProps {
  items: CartItem[];
  hasStockWarnings: boolean;
}

/**
 * Checkout button — calls initiateCheckoutAction and redirects to Vipps.
 */
export function CheckoutButton({ items, hasStockWarnings }: CheckoutButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleCheckout() {
    if (isPending || items.length === 0) return;
    setError("");

    startTransition(async () => {
      const result = await initiateCheckoutAction(
        items.map((i) => ({ sku: i.sku, quantity: i.quantity }))
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Redirect to Vipps
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={isPending || items.length === 0}
        style={{
          width: "100%",
          padding: "0.75rem",
          background: isPending || items.length === 0 ? "#d1d5db" : "#e85a10",
          color: isPending || items.length === 0 ? "#9ca3af" : "#fff",
          border: "none",
          borderRadius: "0.5rem",
          cursor: isPending || items.length === 0 ? "not-allowed" : "pointer",
          fontWeight: 700,
          fontSize: "1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
        }}
      >
        {isPending ? (
          "Starter betaling…"
        ) : (
          <>
            <span
              style={{
                display: "inline-block",
                background: "#fff",
                color: "#e85a10",
                borderRadius: "0.25rem",
                padding: "0 0.375rem",
                fontSize: "0.8125rem",
                fontWeight: 700,
                lineHeight: "1.5rem",
              }}
            >
              Vipps
            </span>
            Betal med Vipps
          </>
        )}
      </button>

      {hasStockWarnings && !error && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "#b45309" }}>
          Merk: noen varer kan ha begrenset lagerbeholdning.
        </p>
      )}

      {error && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#dc2626" }}>
          {error}
        </p>
      )}
    </div>
  );
}
