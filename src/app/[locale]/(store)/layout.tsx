/**
 * Store route-group layout.
 *
 * Wraps all public-facing storefront pages (home, products, categories).
 * Navigation / header / footer are added in a later UI phase.
 *
 * The StorefrontScanner floating button is injected here so it appears
 * on every customer-facing page.
 */
import StorefrontScanner from "@/components/scanner/StorefrontScanner";

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <StorefrontScanner />
    </>
  );
}
