import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Link, Preview,
} from "@react-email/components";
import * as React from "react";

export interface ReadyForPickupEmailProps {
  customerName: string;
  orderId:      string;
  storeName:    string;
  storeAddress: string;
  storePhone:   string;
  items: { name: string; qty: number }[];
}

export default function ReadyForPickupEmail({
  customerName, orderId, storeName, storeAddress, storePhone, items,
}: ReadyForPickupEmailProps) {
  return (
    <Html lang="nb">
      <Head />
      <Preview>Ordren din er klar for henting – {storeName}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Dyvika Maskin AS</Heading>
            <Text style={sub}>Ordren din er klar! ✅</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Hei {customerName},</Text>
            <Text style={para}>
              Ordren din ({orderId}) er klar for henting hos {storeName}.
            </Text>

            {/* Pickup details */}
            <Section style={pickupBox}>
              <Heading as="h2" style={{ ...sectionTitle, margin: "0 0 8px", color: "#1e40af" }}>
                Hentedetaljer
              </Heading>
              <Text style={{ ...para, margin: "0 0 4px", color: "#1e3a8a" }}>
                📍 {storeAddress}
              </Text>
              <Text style={{ ...para, margin: "0 0 4px", color: "#1e3a8a" }}>
                📞 {storePhone}
              </Text>
              <Text style={{ ...para, margin: "0.5rem 0 0", fontSize: "12px", color: "#3730a3" }}>
                Ta med ordrenummer {orderId} når du henter.
              </Text>
            </Section>

            <Heading as="h2" style={sectionTitle}>Innhold</Heading>
            {items.map((item, i) => (
              <Text key={i} style={{ ...para, margin: "0 0 4px" }}>
                × {item.qty} — {item.name}
              </Text>
            ))}

            <Hr style={divider} />
            <Text style={para}>
              Spørsmål?{" "}
              <Link href="mailto:post@dyvikamaskin.no">Kontakt oss</Link>
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
const container: React.CSSProperties = { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", overflow: "hidden" };
const header: React.CSSProperties = { backgroundColor: "#1d4ed8", padding: "24px 32px" };
const h1: React.CSSProperties = { color: "#eff6ff", fontSize: "22px", fontWeight: 700, margin: 0 };
const sub: React.CSSProperties = { color: "#bfdbfe", fontSize: "14px", margin: "4px 0 0" };
const content: React.CSSProperties = { padding: "28px 32px" };
const footer: React.CSSProperties = { backgroundColor: "#f8fafc", padding: "16px 32px", borderTop: "1px solid #e2e8f0" };
const footerText: React.CSSProperties = { fontSize: "12px", color: "#94a3b8", margin: 0 };
const greeting: React.CSSProperties = { fontSize: "15px", color: "#0f172a", margin: "0 0 12px" };
const para: React.CSSProperties = { fontSize: "14px", color: "#374151", lineHeight: "1.6", margin: "0 0 16px" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 8px" };
const divider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "20px 0" };
const pickupBox: React.CSSProperties = { backgroundColor: "#eff6ff", borderRadius: "6px", padding: "16px", marginBottom: "20px", border: "1px solid #bfdbfe" };
