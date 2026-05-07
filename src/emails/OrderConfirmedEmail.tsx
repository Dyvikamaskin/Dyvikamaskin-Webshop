import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Link, Preview, Row, Column,
} from "@react-email/components";
import * as React from "react";

export interface OrderConfirmedEmailProps {
  customerName:  string;
  orderId:       string;          // short display ID (first 8 chars)
  storeName:     string;
  isPickup:      boolean;
  items: { name: string; sku: string; qty: number; lineTotal: string }[];
  subtotalExcl:  string;
  mvaAmount:     string;
  totalIncl:     string;
  invoiceNumber: string | null;
}

export default function OrderConfirmedEmail({
  customerName, orderId, storeName, isPickup,
  items, subtotalExcl, mvaAmount, totalIncl, invoiceNumber,
}: OrderConfirmedEmailProps) {
  return (
    <Html lang="nb">
      <Head />
      <Preview>Bestillingsbekreftelse – ordre {orderId}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Heading style={headerH1}>Dyvika Maskin AS</Heading>
            <Text style={headerSub}>Takk for bestillingen!</Text>
          </Section>

          {/* Body */}
          <Section style={contentStyle}>
            <Text style={greeting}>Hei {customerName},</Text>
            <Text style={para}>
              Vi har mottatt din bestilling og bekrefter hermed ordren.
              {invoiceNumber
                ? ` Faktura ${invoiceNumber} er vedlagt.`
                : " Du vil motta betalingsinformasjon separat."}
            </Text>

            {/* Order summary */}
            <Heading as="h2" style={sectionTitle}>Bestillingsdetaljer</Heading>

            {/* Items */}
            {items.map((item, i) => (
              <Row key={i} style={itemRow}>
                <Column style={{ flex: 1 }}>
                  <Text style={itemName}>{item.name}</Text>
                  <Text style={itemSku}>SKU: {item.sku}</Text>
                </Column>
                <Column style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <Text style={itemQty}>× {item.qty}</Text>
                  <Text style={itemTotal}>{item.lineTotal}</Text>
                </Column>
              </Row>
            ))}

            <Hr style={divider} />

            {/* Totals */}
            <TotalRow label="Subtotal eks. MVA" value={subtotalExcl} />
            <TotalRow label="MVA 25 %"          value={mvaAmount} />
            <TotalRow label="Totalt inkl. MVA"  value={totalIncl} bold />

            <Hr style={divider} />

            {/* Delivery */}
            <Text style={para}>
              <strong>Levering:</strong>{" "}
              {isPickup
                ? `Hentes i butikk — ${storeName}`
                : `Sendes fra ${storeName}. Du mottar en ny e-post med sporingsinformasjon når ordren er sendt.`}
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerText}>
              Spørsmål? Ta kontakt med oss på{" "}
              <Link href="mailto:post@dyvikamaskin.no">post@dyvikamaskin.no</Link>
            </Text>
            <Text style={footerText}>© {new Date().getFullYear()} Dyvika Maskin AS</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Row style={{ marginBottom: "4px" }}>
      <Column style={{ flex: 1 }}>
        <Text style={{ ...para, margin: 0, fontWeight: bold ? 700 : 400 }}>{label}</Text>
      </Column>
      <Column style={{ textAlign: "right" }}>
        <Text style={{ ...para, margin: 0, fontWeight: bold ? 700 : 400 }}>{value}</Text>
      </Column>
    </Row>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = { backgroundColor: "#f8fafc", fontFamily: "system-ui, Arial, sans-serif" };
const containerStyle: React.CSSProperties = { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", overflow: "hidden" };
const headerStyle: React.CSSProperties = { backgroundColor: "#0f172a", padding: "24px 32px" };
const headerH1: React.CSSProperties = { color: "#f1f5f9", fontSize: "22px", fontWeight: 700, margin: 0 };
const headerSub: React.CSSProperties = { color: "#94a3b8", fontSize: "14px", margin: "4px 0 0" };
const contentStyle: React.CSSProperties = { padding: "28px 32px" };
const footerStyle: React.CSSProperties = { backgroundColor: "#f8fafc", padding: "16px 32px", borderTop: "1px solid #e2e8f0" };
const footerText: React.CSSProperties = { fontSize: "12px", color: "#94a3b8", margin: "2px 0" };
const greeting: React.CSSProperties = { fontSize: "15px", color: "#0f172a", margin: "0 0 12px" };
const para: React.CSSProperties = { fontSize: "14px", color: "#374151", lineHeight: "1.6", margin: "0 0 16px" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 12px" };
const divider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "16px 0" };
const itemRow: React.CSSProperties = { borderBottom: "1px solid #f1f5f9", paddingBottom: "8px", marginBottom: "8px" };
const itemName: React.CSSProperties = { fontSize: "14px", color: "#1e293b", fontWeight: 600, margin: 0 };
const itemSku: React.CSSProperties = { fontSize: "11px", color: "#64748b", fontFamily: "monospace", margin: "2px 0 0" };
const itemQty: React.CSSProperties = { fontSize: "13px", color: "#64748b", margin: 0 };
const itemTotal: React.CSSProperties = { fontSize: "14px", color: "#1e293b", fontWeight: 600, margin: "2px 0 0" };
