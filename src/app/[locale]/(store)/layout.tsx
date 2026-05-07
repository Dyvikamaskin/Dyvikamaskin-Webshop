import StoreHeader from "@/components/layout/StoreHeader";
import StorefrontScanner from "@/components/scanner/StorefrontScanner";

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <StoreHeader />
      {children}
      <StorefrontScanner />
    </>
  );
}
