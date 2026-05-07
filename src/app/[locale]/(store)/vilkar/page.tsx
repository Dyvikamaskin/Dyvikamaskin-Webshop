import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kjøpsvilkår — Dyvikamaskin",
  description:
    "Kjøpsvilkår for Dyvikamaskin — betaling, levering, angrerett og reklamasjon.",
};

/**
 * Terms of sale page — /vilkar
 * Required by Vipps merchant registration and Norwegian e-commerce law.
 */
export default function VilkarPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "760px", margin: "0 auto", lineHeight: 1.7, color: "#1a1a1a" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Kjøpsvilkår
      </h1>
      <p style={{ color: "#666", marginBottom: "2.5rem", fontSize: "0.9rem" }}>
        Sist oppdatert: mai 2026
      </p>

      <Section title="1. Selger">
        <p>
          <strong>Dyvika Maskin AS</strong>
        </p>
        <dl style={dlStyle}>
          <dt style={dtStyle}>Organisasjonsnummer</dt>
          <dd style={ddStyle}>930 985 589</dd>
          <dt style={dtStyle}>E-post</dt>
          <dd style={ddStyle}><a href="mailto:post@dyvikamaskin.no" style={{ color: "#1d4ed8" }}>post@dyvikamaskin.no</a></dd>
          <dt style={dtStyle}>Adresse</dt>
          <dd style={ddStyle}>Norge</dd>
        </dl>
      </Section>

      <Section title="2. Priser">
        <p>
          Alle priser er oppgitt i norske kroner (NOK). Priser for
          forbrukerkunder er inkludert MVA. Priser for bedriftskunder er
          oppgitt eksklusiv MVA, som beregnes separat.
        </p>
        <p>
          Dyvikamaskin forbeholder seg retten til å endre priser uten
          forhåndsvarsel. Gjeldende pris er den som er oppgitt på
          bestillingstidspunktet.
        </p>
      </Section>

      <Section title="3. Betaling">
        <p>
          Vi aksepterer betaling via <strong>Vipps</strong>. Betaling
          gjennomføres ved bestilling. For godkjente bedriftskunder kan betaling
          mot faktura tilbys etter avtale.
        </p>
        <p>
          Ordren bekreftes når betaling er registrert. Du mottar en
          ordrebekreftelse på e-post.
        </p>
      </Section>

      <Section title="4. Levering">
        <p>
          Varer kan hentes i butikk eller sendes til oppgitt adresse. Valg av
          leveringsmetode gjøres i kassen. Fraktkostnader beregnes separat per
          lager dersom varer sendes fra flere lokasjoner.
        </p>
        <p>
          Estimert leveringstid oppgis på produktsiden. Leveringstid kan
          variere ved høyt ordrevolumet eller forsinkelser fra leverandør.
        </p>
      </Section>

      <Section title="5. Angrerett">
        <p>
          Som forbruker har du 14 dagers angrerett fra den dagen du mottar
          varen, i henhold til angrerettloven. For å benytte angreretten må du
          melde fra til oss innen fristen.
        </p>
        <p>
          Kontakt oss på{" "}
          <a href="mailto:post@dyvikamaskin.no" style={{ color: "#1d4ed8" }}>
            post@dyvikamaskin.no
          </a>{" "}
          med ordrenummeret ditt. Vi sender deg et angreskjema og videre
          instruksjoner.
        </p>
        <p>
          Varen skal returneres i original stand. Returfrakt er kjøpers ansvar
          med mindre varen er feil eller mangelfull. Tilbakebetaling skjer innen
          14 dager etter at vi har mottatt varen.
        </p>
        <p style={{ fontSize: "0.875rem", color: "#555" }}>
          Angreretten gjelder ikke for bedriftskunder. Spesialtilpassede varer
          og varer som av hygieniske årsaker ikke kan returneres, er også
          unntatt.
        </p>
      </Section>

      <Section title="6. Reklamasjon og garanti">
        <p>
          Forbrukere har 2 års reklamasjonsrett på varer med feil eller mangler,
          i henhold til kjøpsloven. For bedriftskunder er reklamasjonsretten 1
          år fra leveringsdato.
        </p>
        <p>
          Ved reklamasjon, kontakt oss på{" "}
          <a href="mailto:post@dyvikamaskin.no" style={{ color: "#1d4ed8" }}>
            post@dyvikamaskin.no
          </a>{" "}
          med ordrenummer og beskrivelse av feilen. Vi vil besvare henvendelsen
          innen 3 virkedager.
        </p>
      </Section>

      <Section title="7. Klagebehandling">
        <p>
          Dersom du ikke er fornøyd med vår behandling av en klage, kan du
          kontakte{" "}
          <a
            href="https://www.forbrukertilsynet.no"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#1d4ed8" }}
          >
            Forbrukertilsynet
          </a>{" "}
          eller bringe saken inn for{" "}
          <a
            href="https://www.forbrukerradet.no/forbrukereuropanetwork/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#1d4ed8" }}
          >
            Forbruker Europa
          </a>
          . EU-kommisjonens klageportal:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#1d4ed8" }}
          >
            ec.europa.eu/consumers/odr
          </a>
          .
        </p>
      </Section>

      <Section title="8. Personvern">
        <p>
          Vi behandler dine personopplysninger i henhold til
          personopplysningsloven og GDPR. Opplysningene brukes utelukkende til å
          behandle din bestilling og gi deg god kundeservice.
        </p>
        <p>
          Vi deler ikke dine opplysninger med tredjeparter utover det som er
          nødvendig for å gjennomføre kjøpet (f.eks. frakt og betaling). Du har
          rett til innsyn, retting og sletting av dine opplysninger. Kontakt oss
          for mer informasjon.
        </p>
      </Section>

      <Section title="9. Force majeure">
        <p>
          Dyvikamaskin er ikke ansvarlig for forsinkelser eller mangler som
          skyldes forhold utenfor vår kontroll, herunder naturkatastrofer,
          streik, importrestriksjoner eller leverandørsvikt.
        </p>
      </Section>

      <Section title="10. Lovvalg og verneting">
        <p>
          Disse kjøpsvilkårene er underlagt norsk rett. Eventuelle tvister
          behandles ved Dyvikamaskins alminnelige verneting i Norge.
        </p>
      </Section>
    </main>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2
        style={{
          fontSize: "1.125rem",
          fontWeight: 700,
          marginBottom: "0.75rem",
          paddingBottom: "0.375rem",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {children}
      </div>
    </section>
  );
}

const dlStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "0.25rem 1.5rem",
  margin: "0.5rem 0 0",
  fontSize: "0.9375rem",
};
const dtStyle: React.CSSProperties = { fontWeight: 600, color: "#374151" };
const ddStyle: React.CSSProperties = { margin: 0 };
