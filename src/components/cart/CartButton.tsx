"use client";

import Link from "next/link";
import { useCartStore } from "@/lib/stores/use-cart";

/**
 * Navigation cart button — shows item count badge.
 * Used in the site header (Phase 5 UI pass adds Tailwind).
 */
export function CartButton() {
  const itemCount = useCartStore((s) => s.itemCount);

  return (
    <Link
      href="/handlekurv"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.375rem 0.75rem",
        border: "1px solid #d1d5db",
        borderRadius: "0.5rem",
        textDecoration: "none",
        color: "#374151",
        fontWeight: 500,
        fontSize: "0.875rem",
        background: "#fff",
      }}
    >
      🛒
      {itemCount > 0 && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "1.25rem",
            height: "1.25rem",
            padding: "0 0.25rem",
            background: "#1d4ed8",
            color: "#fff",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 700,
          }}
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
      <span>Handlekurv</span>
    </Link>
  );
}
