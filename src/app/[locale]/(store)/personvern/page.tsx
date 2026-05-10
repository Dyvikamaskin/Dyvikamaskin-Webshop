import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personvernerklæring — Dyvikamaskin",
  description: "Hvordan vi behandler dine personopplysninger.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Behandlingsansvarlig",
    body: [
      "Dyvikamaskin AS er behandlingsansvarlig for personopplysninger som samles inn på dette nettstedet. Henvendelser kan rettes til: support@dyvikamaskin.no.",
    ],
  },
  {
    title: "2. Hvilke personopplysninger vi samler inn",
    body: [
      "Når du oppretter en konto eller legger inn en bestilling, lagrer vi: navn, e-postadresse, telefonnummer, leveringsadresse, organisasjonsnummer (for bedriftskunder), ordrehistorikk, og — for innloggede brukere — innstillinger som lagrede maskiner.",
      "Vi samler IKKE inn betalingskortdata. Vipps håndterer all kortinformasjon i sin egen plattform; vi mottar kun en transaksjonsreferanse.",
    ],
  },
  {
    title: "3. Formål med behandlingen",
    body: [
      "Vi behandler personopplysninger for å (a) levere bestilte varer og fakturere riktig, (b) gi kundeservice, (c) overholde regnskaps- og bokføringsplikten (Bokføringsloven krever 5 års oppbevaring av salgsdokumentasjon), og (d) — kun med ditt eksplisitte samtykke — sende markedsføringspost.",
    ],
  },
  {
    title: "4. Rettslig grunnlag",
    body: [
      "GDPR artikkel 6(1)(b) — oppfyllelse av kjøpsavtale, for ordrebehandling og levering.",
      "GDPR artikkel 6(1)(c) — rettslig forpliktelse, for regnskapsoppbevaring etter Bokføringsloven.",
      "GDPR artikkel 6(1)(a) — samtykke, for markedsføringspost.",
    ],
  },
  {
    title: "5. Hvor lenge vi lagrer data",
    body: [
      "Ordrer, fakturaer og regnskapsbilag oppbevares i minimum 5 år etter regnskapsårets slutt, jf. Bokføringsloven §13.",
      "Kundeprofiler uten aktivitet i 3 år anonymiseres på forespørsel. PII (navn, e-post, adresse) erstattes med 'ANONYMISERT' mens ordretotaler og fakturanumre bevares for regnskap.",
      "Markedsføringssamtykke kan trekkes når som helst — kontakt support@dyvikamaskin.no eller bruk avregistreringslenken i e-poster.",
    ],
  },
  {
    title: "6. Hvem vi deler data med",
    body: [
      "Vipps AS — for å gjennomføre betalinger.",
      "Bring (Posten Norge AS) — for fraktoppslag, etiketter og sporing.",
      "Resend Inc. — for utsending av transaksjonelle og markedsmessige e-poster.",
      "Supabase Inc. — leverer database- og autentiseringsinfrastruktur. Data lagres på servere innenfor EU/EØS (Irland).",
      "Vi selger ALDRI personopplysninger til tredjepart.",
    ],
  },
  {
    title: "7. Dine rettigheter (GDPR Art. 15–22)",
    body: [
      "Innsyn (Art. 15): Du kan be om en kopi av personopplysningene vi har lagret om deg, levert i maskinlesbart format (JSON).",
      "Retting (Art. 16): Du kan rette unøyaktige opplysninger via /konto.",
      "Sletting / 'rett til å bli glemt' (Art. 17): Du kan be om anonymisering. PII fjernes; ordrer og fakturaer bevares i anonymisert form for regnskapskrav.",
      "Begrensning (Art. 18) og innsigelse (Art. 21): Tilgjengelig på forespørsel.",
      "Dataportabilitet (Art. 20): Eksport leveres som JSON.",
      "Henvendelser sendes til support@dyvikamaskin.no. Vi svarer innen 30 dager (Art. 12(3)).",
    ],
  },
  {
    title: "8. Klagerett",
    body: [
      "Hvis du mener vi behandler dine personopplysninger i strid med personvernregelverket, har du rett til å klage til Datatilsynet (datatilsynet.no).",
    ],
  },
  {
    title: "9. Endringer i denne erklæringen",
    body: [
      "Vi kan oppdatere denne erklæringen ved behov. Aktiv kundeopplysninger blir varslet via e-post ved vesentlige endringer.",
      "Sist oppdatert: 11. mai 2026.",
    ],
  },
];

export default function PersonvernPage() {
  return (
    <main style={{ maxWidth: "780px", margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "sans-serif", lineHeight: 1.55 }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
        Personvernerklæring
      </h1>
      <p style={{ color: "#64748b", marginBottom: "2rem" }}>
        Hvordan Dyvikamaskin AS behandler dine personopplysninger.
      </p>

      {SECTIONS.map((s) => (
        <section key={s.title} style={{ marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
            {s.title}
          </h2>
          {s.body.map((p, i) => (
            <p key={i} style={{ margin: "0 0 0.6rem", color: "#334155", fontSize: "0.95rem" }}>
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
