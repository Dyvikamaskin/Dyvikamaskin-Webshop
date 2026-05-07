import { CartContent } from "@/components/cart/CartContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Handlekurv — Dyvikamaskin",
};

/**
 * Cart page — /handlekurv
 *
 * The page shell is a server component; CartContent is a client component
 * that reads from the Zustand store and re-validates pricing with the server.
 */
export default function CartPage() {
  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Handlekurv
      </h1>
      <CartContent />
    </main>
  );
}
