import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Link, Preview,
} from "@react-email/components";
import * as React from "react";

export interface InvoiceIssuedEmailProps {
  customerName:   string;
  invoiceNumber:  string;
  orderId:        string;
  totalIncl:      string;
  dueDate:        string;   // formatted "dd.mm.yyyy"
  kidNumber:      string | null;
  accountNumber:  string;   // from env
}

export default function InvoiceIssuedEmail({
  customerName, invoiceNumber, orderId, totalIncl, dueDate, kidNumber, accountNumber,
}: InvoiceIssuedEmailProps) {
  return (
    <Html lang="nb">
      <Head />
      <Preview>Faktura {invoiceNumber} fra Dyvika Maskin AS</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Dyvika Maskin AS</Heading>
            <Text style={sub}>Faktura {invoiceNumber}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Hei {customerName},</Text>
            <Text style={para}>
              Faktura for ordre {orderId} er vedlagt denne e-posten som PDF.
            </Text>

            {/* Payment details */}
            <Section style={infoBox}>
              <Heading as="h2" style={{ ...sectionTitle, margin: "0 0 10px", color: "#92400e" }}>
                Betalingsinformasjon
              </Heading>
              <InfoRow label="Fakturanummer"   value={invoiceNumber} />
              <InfoRow label="Beløp"           value={totalIncl} bold />
              <InfoRow label="Forfallsdato"    value={dueDate} />
              <InfoRow label="Kontonummer"     value={accountNumber} />
              {kidNumber && <InfoRow label="KID-nummer" value={kidNumber} bold />}
              {!kidNumber && (
                <Text style={{ fontSize: "12px", color: "#64748b", margin: "6px 0 0" }}>
                  Merk betalingen med fakturanummer {invoiceNumber}.
                </Text>
              )}
            </Section>

            <Hr style={divider} />
            <Text style={para}>
              Faktura-PDF er vedlagt. Spørsmål?{" "}
              <Link href="mailto:faktura@dyvikamaskin.no">faktura@dyvikamaskin.no</Link>
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>© {new Date().getFullYear()} Dyvika Maskin AS · Org.nr. {process.env.COMPANY_ORG_NUMBER ?? "—"}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Text style={{ fontSize: "13px", color: "#374151", margin: "0 0 4px" }}>
      <span style={{ fontWeight: 600 }}>{label}:</span>{" "}
      <span style={{ fontWeight: bold ? 700 : 400 }}>{value}</span>
    </Text>
  );
}

const body: React.CSSProperties = { backgroundColor: "#f8fafc", fontFamily: "system-ui, Arial, sans-serif" };
const container: React.CSSProperties = { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", overflow: "hidden" };
const header: React.CSSProperties = { backgroundColor: "#0f172a", padding: "24px 32px" };
const h1: React.CSSProperties = { color: "#f1f5f9", fontSize: "22px", fontWeight: 700, margin: 0 };
const sub: React.CSSProperties = { color: "#94a3b8", fontSize: "14px", margin: "4px 0 0" };
const content: React.CSSProperties = { padding: "28px 32px" };
const footer: React.CSSProperties = { backgroundColor: "#f8fafc", padding: "16px 32px", borderTop: "1px solid #e2e8f0" };
const footerText: React.CSSProperties = { fontSize: "12px", color: "#94a3b8", margin: 0 };
const greeting: React.CSSProperties = { fontSize: "15px", color: "#0f172a", margin: "0 0 12px" };
const para: React.CSSProperties = { fontSize: "14px", color: "#374151", lineHeight: "1.6", margin: "0 0 16px" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };
const divider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "20px 0" };
const infoBox: React.CSSProperties = { backgroundColor: "#fffbeb", borderRadius: "6px", padding: "16px", marginBottom: "20px", border: "1px solid #fde68a" };
