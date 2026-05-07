"use client";

import { useState, useTransition } from "react";
import { useCartStore } from "@/lib/stores/use-cart";
import { getItemPricingAction } from "@/app/actions/cart";

interface AddToCartButtonProps {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  mainImage: string | null;
  categoryId: string | null;
  minimumOrderQuantity: number;
  availableStock: number;
  /** Pre-calculated price shown on the page — used as optimistic snapshot */
  initialPriceEx: number;
  initialPriceInc: number;
  initialMvaRate: number;
  initialDiscountPct: number;
  initialDiscountSource: string;
}

/**
 * Add-to-cart button — client component.
 *
 * Flow:
 *   1. User clicks → call server action for fresh pricing + stock check
 *   2. Server action validates stock and returns authoritative pricing
 *   3. Add item to Zustand cart with server-confirmed price snapshot
 *   4. Show brief "Lagt til" confirmation
 */
export function AddToCartButton({
  productId,
  sku,
  name,
  brand,
  mainImage,
  categoryId,
  minimumOrderQuantity,
  availableStock,
  initialPriceEx,
  initialPriceInc,
  initialMvaRate,
  initialDiscountPct,
  initialDiscountSource,
}: AddToCartButtonProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<"added" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const isOutOfStock = availableStock === 0;

  function handleAddToCart() {
    if (isOutOfStock || isPending) return;

    setFeedback(null);

    startTransition(async () => {
      const result = await getItemPricingAction(sku);

      if (!result.ok) {
        setErrorMsg(result.error);
        setFeedback("error");
        setTimeout(() => setFeedback(null), 4000);
        return;
      }

      addItem({
        productId,
        sku,
        name,
        brand,
        mainImage,
        categoryId,
        minimumOrderQuantity,
        quantity: minimumOrderQuantity,
        priceEx: result.data.priceEx,
        priceInc: result.data.priceInc,
        mvaRate: result.data.mvaRate,
        discountPct: result.data.discountPct,
        discountSource: result.data.discountSource,
        promotionId: result.data.promotionId,
      });

      setFeedback("added");
      setTimeout(() => setFeedback(null), 2500);
    });
  }

  return (
    <div>
      <button
        onClick={handleAddToCart}
        disabled={isOutOfStock || isPending}
        style={{
          width: "100%",
          padding: "0.75rem",
          background: isOutOfStock ? "#d1d5db" : feedback === "added" ? "#16a34a" : "#1d4ed8",
          color: isOutOfStock ? "#9ca3af" : "#fff",
          border: "none",
          borderRadius: "0.5rem",
          cursor: isOutOfStock || isPending ? "not-allowed" : "pointer",
          fontWeight: 700,
          fontSize: "1rem",
          transition: "background 0.2s",
        }}
      >
        {isPending
          ? "Legger til..."
          : feedback === "added"
          ? "✓ Lagt i handlekurv"
          : isOutOfStock
          ? "Ikke på lager"
          : "Legg i handlekurv"}
      </button>

      {feedback === "error" && (
        <p
          style={{
            marginTop: "0.5rem",
            color: "#dc2626",
            fontSize: "0.875rem",
          }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  );
}
