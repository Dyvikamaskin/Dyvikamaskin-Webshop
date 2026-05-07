/**
 * Store route-group layout.
 *
 * Wraps all public-facing storefront pages (home, products, categories).
 * Navigation / header / footer are added in a later UI phase.
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
