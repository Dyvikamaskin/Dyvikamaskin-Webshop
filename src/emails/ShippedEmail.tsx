import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Link, Preview, Button,
} from "@react-email/components";
import * as React from "react";

export interface ShippedEmailProps {
  customerName:   string;
  orderId:        string;
  storeName:      string;
  trackingNumber: string | null;
  trackingUrl:    string | null;
  items: { name: string; qty: number }[];
}

export default function ShippedEmail({
  customerName, orderId, storeName, trackingNumber, trackingUrl, items,
}: ShippedEmailProps) {
  return (
    <Html lang="nb">
      <Head />
      <Preview>Ordren din er sendt – ordre {orderId}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Dyvika Maskin AS</Heading>
            <Text style={sub}>Ordren din er på vei! 📦</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Hei {customerName},</Text>
            <Text style={para}>
              Ordren din ({orderId}) er nå sendt fra {storeName}.
            </Text>

            {trackingNumber && (
              <Section style={{ backgroundColor: "#f0fdf4", borderRadius: "6px", padding: "16px", marginBottom: "20px", border: "1px solid #bbf7d0" }}>
                <Text style={{ ...para, margin: 0, fontWeight: 700, color: "#166534" }}>
                  Sporingsnummer: {trackingNumber}
                </Text>
                {trackingUrl && (
                  <Button href={trackingUrl} style={trackBtn}>
                    Spor pakken →
                  </Button>
                )}
              </Section>
            )}

            <Heading as="h2" style={sectionTitle}>Innhold</Heading>
            {items.map((item, i) => (
              <Text key={i} style={{ ...para, margin: "0 0 4px" }}>
                × {item.qty} — {item.name}
              </Text>
            ))}

            <Hr style={divider} />
            <Text style={para}>
              Har du spørsmål om forsendelsen?{" "}
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
const header: React.CSSProperties = { backgroundColor: "#166534", padding: "24px 32px" };
const h1: React.CSSProperties = { color: "#f0fdf4", fontSize: "22px", fontWeight: 700, margin: 0 };
const sub: React.CSSProperties = { color: "#bbf7d0", fontSize: "14px", margin: "4px 0 0" };
const content: React.CSSProperties = { padding: "28px 32px" };
const footer: React.CSSProperties = { backgroundColor: "#f8fafc", padding: "16px 32px", borderTop: "1px solid #e2e8f0" };
const footerText: React.CSSProperties = { fontSize: "12px", color: "#94a3b8", margin: 0 };
const greeting: React.CSSProperties = { fontSize: "15px", color: "#0f172a", margin: "0 0 12px" };
const para: React.CSSProperties = { fontSize: "14px", color: "#374151", lineHeight: "1.6", margin: "0 0 16px" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 8px" };
const divider: React.CSSProperties = { borderColor: "#e2e8f0", margin: "20px 0" };
const trackBtn: React.CSSProperties = { backgroundColor: "#166534", color: "#fff", padding: "10px 20px", borderRadius: "6px", fontWeight: 600, textDecoration: "none", display: "inline-block", marginTop: "10px" };
