import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Link, Preview,
} from "@react-email/components";
import * as React from "react";

export interface LowStockAlertEmailProps {
  managerName:  string;
  storeName:    string;
  items: {
    sku:           string;
    productName:   string;
    currentQty:    number;
    threshold:     number;
    locationCode:  string | null;
  }[];
}

export default function LowStockAlertEmail({ managerName, storeName, items }: LowStockAlertEmailProps) {
  return (
    <Html lang="nb">
      <Head />
      <Preview>{`Lavt lager-varsel – ${storeName} (${items.length} produkt${items.length !== 1 ? "er" : ""})`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Dyvika Maskin AS</Heading>
            <Text style={sub}>⚠ Lavt lager-varsel</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Hei {managerName},</Text>
            <Text style={para}>
              Følgende produkt{items.length !== 1 ? "er er" : " er"} under terskelverdien for lavt lager på {storeName}:
            </Text>

            {/* Table */}
            <Section style={tableWrap}>
              {/* Header */}
              <Section style={tableHeader}>
                <Text style={{ ...th, width: "20%" }}>SKU</Text>
                <Text style={{ ...th, flex: 1 }}>Produkt</Text>
                <Text style={{ ...th, width: "12%", textAlign: "right" }}>Beholdning</Text>
                <Text style={{ ...th, width: "12%", textAlign: "right" }}>Terskel</Text>
                <Text style={{ ...th, width: "20%" }}>Lokasjon</Text>
              </Section>
              {items.map((item, i) => (
                <Section key={i} style={{ ...tableRow, backgroundColor: i % 2 === 1 ? "#fafafa" : "#fff" }}>
                  <Text style={{ ...td, width: "20%", fontFamily: "monospace", fontSize: "11px" }}>{item.sku}</Text>
                  <Text style={{ ...td, flex: 1 }}>{item.productName}</Text>
                  <Text style={{ ...td, width: "12%", textAlign: "right", color: item.currentQty === 0 ? "#dc2626" : "#d97706", fontWeight: 700 }}>
                    {item.currentQty}
                  </Text>
                  <Text style={{ ...td, width: "12%", textAlign: "right", color: "#64748b" }}>{item.threshold}</Text>
                  <Text style={{ ...td, width: "20%", fontSize: "11px", color: "#64748b" }}>
                    {item.locationCode ?? "–"}
                  </Text>
                </Section>
              ))}
            </Section>

            <Hr style={divider} />
            <Text style={para}>
              <Link href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/lager`}>
                Gå til lageroversikten →
              </Link>
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>© {new Date().getFullYear()} Dyvika Maskin AS</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = { backgroundColor: "#f8fafc", fontFamily: "system-ui, Arial, sans-serif" };
const container: React.CSSProperties = { maxWidth: "640px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", overflow: "hidden" };
const header: React.CSSProperties = { backgroundColor: "#92400e", padding: "24px 32px" };
const h1: React.CSSProperties = { color: "#fef3c7", fontSize: "22px", fontWeight: 700, margin: 0 };
const sub: React.CSSProperties = { color: "#fde68a", fontSize: "14px", margin: "4px 0 0" };
const content: React.CSSProperties = { padding: "28px 32px" };
const footer: React.CSSProperties = { backgroundColor: "#f8fafc", padding: "16px 32px", borderTop: "1px solid #e2e8f0" };
const footerText: React.CSSProperties = { fontSize: "12px", color: "#94a3b8", margin: 0 };
const greeting: React.CSSProperties = { fontSize: "15px", color: "#0f172a", margin: "0 0 12px" };
const para: React.CSSProperties = { fontSize: "14px", color: "#374151", lineHeight: "1.6", margin: "0 0 16px" };
const divider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "20px 0" };
const tableWrap: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden", marginBottom: "16px" };
const tableHeader: React.CSSProperties = { backgroundColor: "#f1f5f9", display: "flex", padding: "8px 12px" };
const tableRow: React.CSSProperties = { display: "flex", padding: "8px 12px", borderTop: "1px solid #f1f5f9" };
const th: React.CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 };
const td: React.CSSProperties = { fontSize: "13px", color: "#1e293b", margin: 0 };
