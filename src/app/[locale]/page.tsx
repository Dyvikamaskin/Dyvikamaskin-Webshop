import { useTranslations } from "next-intl";

/**
 * Home page — placeholder until Phase 5 (product catalog).
 */
export default function HomePage() {
  const t = useTranslations("nav");

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Dyvikamaskin Webshop</h1>
      <p>Velkommen — produktkatalogen implementeres i Phase 5.</p>
    </main>
  );
}
