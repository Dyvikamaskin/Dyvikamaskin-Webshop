import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deletyper — Dyvikamaskin",
  description:
    "Hva er forskjellen mellom Originaldeler, OEM-deler og Uoriginale deler / Aftermarket?",
};

/**
 * /info/deletyper — Phase 0.7
 *
 * Public help page explaining the three provenance categories used in
 * the catalogue. Linked from the admin new-product form's Opphav ⓘ
 * icon, the storefront filter chip ⓘ icon, and the storefront footer.
 */
export default function DeletyperPage() {
  return (
    <main
      style={{
        maxWidth: "780px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
        fontSize: "0.95rem",
        lineHeight: 1.6,
        color: "#0f172a",
      }}
    >
      <p
        style={{
          fontSize: "0.8rem",
          color: "#94a3b8",
          margin: "0 0 0.25rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Hjelp
      </p>
      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          margin: "0 0 1rem",
        }}
      >
        Originaldeler, OEM-deler og uoriginale deler
      </h1>

      <p style={{ color: "#475569", marginBottom: "1.75rem" }}>
        Hver del i katalogen er merket med ett av tre opphav. Forskjellene
        påvirker pris, garanti og tilgjengelighet.
      </p>

      <Section title="Originaldeler / Genuine Parts">
        Sold in the manufacturer&apos;s branded box.
      </Section>

      <Section title="OEM-deler (originalleverandør)">
        Produsert av det samme selskapet som lagde den originale delen
        da maskinen var ny på fabrikken (f.eks. Bosch, Denso eller
        Valeo).
      </Section>

      <Section title="Uoriginale deler / Aftermarket">
        Dette er deler som er produsert av selskaper som ikke har
        levert deler direkte til fabrikken for din spesifikke modell.
        De er laget for å være et alternativ til de originale delene.
      </Section>

      <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "2rem 0 1rem" }} />

      <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
        Du kan filtrere produkter etter opphav på{" "}
        <Link href="/produkter" style={{ color: "#1e40af", textDecoration: "underline" }}>
          produktoversikten
        </Link>
        .
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h2
        style={{
          fontSize: "1.05rem",
          fontWeight: 700,
          margin: "0 0 0.4rem",
          color: "#0f172a",
        }}
      >
        {title}
      </h2>
      <p style={{ margin: 0, color: "#334155" }}>{children}</p>
    </section>
  );
}
