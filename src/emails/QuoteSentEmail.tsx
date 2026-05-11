import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Preview, Row, Column,
} from "@react-email/components";
import * as React from "react";

export interface QuoteSentEmailProps {
  customerName: string;          // greeting target — name OR email local-part
  quoteNumber: string;
  validUntil: string | null;     // formatted Norwegian date or null
  items: { name: string; sku: string; qty: number; unitPrice: string; lineTotal: string }[];
  subtotalExclMva: string;
  mvaAmount: string;
  totalPrice: string;
  notes: string | null;          // sales rep notes; optional
}

/**
 * Email sent when admin marks a quote SENT.
 *
 * Phase 7 follow-up — closes the "customer-facing quote-accept email"
 * gap noted in the handoff. The customer can reply by email or phone
 * to accept; we don't yet have a self-service accept link (that's a
 * separate small task, would need an unguessable token per quote).
 */
export default function QuoteSentEmail({
  customerName, quoteNumber, validUntil,
  items, subtotalExclMva, mvaAmount, totalPrice, notes,
}: QuoteSentEmailProps) {
  return (
    <Html lang="nb">
      <Head />
      <Preview>Tilbud {quoteNumber} fra Dyvikamaskin</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Heading style={headerH1}>Dyvika Maskin AS</Heading>
            <Text style={headerSub}>Tilbud {quoteNumber}</Text>
          </Section>

          <Section style={contentStyle}>
            <Text style={greeting}>Hei {customerName},</Text>
            <Text style={para}>
              Takk for forespørselen. Vi har satt opp tilbud{" "}
              <strong>{quoteNumber}</strong> basert på den informasjonen
              du sendte oss.
            </Text>
            {validUntil ? (
              <Text style={para}>
                Tilbudet er gyldig til <strong>{validUntil}</strong>.
              </Text>
            ) : null}

            <Heading as="h2" style={sectionTitle}>Linjer</Heading>

            {items.map((it, i) => (
              <Row key={i} style={itemRow}>
                <Column>
                  <Text style={itemName}>{it.name}</Text>
                  <Text style={itemMeta}>{it.sku} · {it.qty} stk × {it.unitPrice}</Text>
                </Column>
                <Column align="right" style={{ verticalAlign: "top" }}>
                  <Text style={itemTotal}>{it.lineTotal}</Text>
                </Column>
              </Row>
            ))}

            <Hr style={hr} />

            <Row>
              <Column><Text style={summaryLabel}>Subtotal eks. MVA</Text></Column>
              <Column align="right"><Text style={summaryValue}>{subtotalExclMva}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={summaryLabel}>MVA</Text></Column>
              <Column align="right"><Text style={summaryValue}>{mvaAmount}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={totalLabel}>Sum inkl. MVA</Text></Column>
              <Column align="right"><Text style={totalValue}>{totalPrice}</Text></Column>
            </Row>

            {notes ? (
              <>
                <Hr style={hr} />
                <Heading as="h2" style={sectionTitle}>Merknad fra oss</Heading>
                <Text style={para}>{notes}</Text>
              </>
            ) : null}

            <Hr style={hr} />

            <Text style={para}>
              For å akseptere tilbudet, svar på denne e-posten eller
              ring oss. Vi konverterer tilbudet til en ordre når du har
              gitt klarsignal, og sender deg betalingsinformasjon.
            </Text>

            <Text style={footer}>
              — Dyvikamaskin
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle:    React.CSSProperties = { backgroundColor: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "1.5rem 0" };
const containerStyle: React.CSSProperties = { background: "#fff", maxWidth: "640px", margin: "0 auto", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" };
const headerStyle:  React.CSSProperties = { background: "#0f172a", color: "#f8fafc", padding: "1.25rem 1.5rem" };
const headerH1:     React.CSSProperties = { margin: 0, fontSize: "1.25rem", color: "#f8fafc" };
const headerSub:    React.CSSProperties = { margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#cbd5e1" };
const contentStyle: React.CSSProperties = { padding: "1.5rem" };
const greeting:     React.CSSProperties = { margin: "0 0 0.75rem", color: "#0f172a", fontSize: "1rem" };
const para:         React.CSSProperties = { margin: "0 0 0.75rem", color: "#334155", fontSize: "0.95rem", lineHeight: 1.5 };
const sectionTitle: React.CSSProperties = { margin: "1.25rem 0 0.5rem", fontSize: "1rem", color: "#0f172a" };
const itemRow:      React.CSSProperties = { borderBottom: "1px solid #f1f5f9", padding: "0.4rem 0" };
const itemName:     React.CSSProperties = { margin: 0, fontSize: "0.9rem", color: "#0f172a", fontWeight: 600 };
const itemMeta:     React.CSSProperties = { margin: "0.15rem 0 0", fontSize: "0.8rem", color: "#64748b" };
const itemTotal:    React.CSSProperties = { margin: 0, fontSize: "0.9rem", color: "#0f172a", fontWeight: 600 };
const hr:           React.CSSProperties = { borderColor: "#e2e8f0", margin: "1rem 0" };
const summaryLabel: React.CSSProperties = { margin: "0.2rem 0", fontSize: "0.875rem", color: "#475569" };
const summaryValue: React.CSSProperties = { margin: "0.2rem 0", fontSize: "0.875rem", color: "#0f172a" };
const totalLabel:   React.CSSProperties = { margin: "0.4rem 0", fontSize: "1rem", fontWeight: 700, color: "#0f172a" };
const totalValue:   React.CSSProperties = { margin: "0.4rem 0", fontSize: "1rem", fontWeight: 700, color: "#0f172a" };
const footer:       React.CSSProperties = { margin: "1.5rem 0 0", fontSize: "0.875rem", color: "#64748b" };
