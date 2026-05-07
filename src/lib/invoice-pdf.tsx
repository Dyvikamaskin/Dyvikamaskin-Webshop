import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ─── Types ────────────────────────────────────────────────────────────────────

type Numeric = number | { toNumber(): number };

export interface InvoiceLineItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPriceExclMva: Numeric;
  mvaRate: Numeric;
  lineTotalExclMva: Numeric;
}

export interface InvoiceData {
  invoiceNumber: string;
  kidNumber: string;
  issuedAt: Date;
  dueDate: Date;
  customer: {
    fullName: string;
    companyName?: string | null;
    orgNumber?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    email: string;
  };
  store: {
    name: string;
    address: string;
    postalCode: string;
    city: string;
    email: string;
    phone: string;
  };
  items: InvoiceLineItem[];
  subtotalExclMva: Numeric;
  mvaAmount: Numeric;
  shippingCost: Numeric;
  totalPrice: Numeric;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toNum = (v: Numeric): number =>
  typeof v === "number" ? v : v.toNumber();

const kr = (v: Numeric): string =>
  toNum(v).toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " kr";

const fmtDate = (d: Date): string =>
  d.toLocaleDateString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 44,
  },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  companyDetail: { fontSize: 8, color: "#555", marginBottom: 2 },
  docTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", color: "#111" },

  // Meta row
  metaRow: { flexDirection: "row", gap: 36, marginBottom: 20 },
  metaBlock: { flexDirection: "column", gap: 3 },
  metaLabel: { fontSize: 7, color: "#888", textTransform: "uppercase" },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 9 },

  // Bill-to
  billTo: {
    backgroundColor: "#f5f5f5",
    borderRadius: 3,
    padding: 10,
    marginBottom: 20,
  },
  billToLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", marginBottom: 5 },
  billToLine: { fontSize: 9, marginBottom: 2 },
  billToSub: { fontSize: 8, color: "#666", marginBottom: 2 },

  // Table
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottom: "0.5 solid #e5e7eb",
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottom: "0.5 solid #e5e7eb",
    backgroundColor: "#fafafa",
  },
  colSku:   { width: "12%" },
  colDesc:  { width: "36%" },
  colQty:   { width: "8%", textAlign: "right" },
  colUnit:  { width: "16%", textAlign: "right" },
  colMva:   { width: "10%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right" },
  colHeaderText: { color: "#ffffff" },

  // Totals
  totalsWrapper: { alignSelf: "flex-end", width: 230, marginTop: 14 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottom: "0.5 solid #e5e7eb",
  },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTop: "1 solid #1a1a1a",
    marginTop: 2,
  },
  totalsLabel: { color: "#555" },
  totalsBold: { fontFamily: "Helvetica-Bold" },

  // Payment info box
  payBox: {
    flexDirection: "row",
    gap: 44,
    marginTop: 22,
    paddingTop: 12,
    borderTop: "1 solid #e5e7eb",
  },
  payLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", marginBottom: 3 },
  payValue: { fontFamily: "Helvetica-Bold", fontSize: 9 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "0.5 solid #d1d5db",
    paddingTop: 5,
    color: "#9ca3af",
    fontSize: 7,
  },
});

// ─── Document component ───────────────────────────────────────────────────────

function InvoiceDocument({ data }: { data: InvoiceData }) {
  const { customer, store, items } = data;

  // Derive dominant MVA rate for the totals label (all items share the same rate in practice)
  const mvaPercent =
    items.length > 0 ? Math.round(toNum(items[0].mvaRate) * 100) : 25;

  return (
    <Document
      title={`Faktura ${data.invoiceNumber}`}
      author="Dyvika Maskin AS"
      subject="Faktura"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>Dyvika Maskin AS</Text>
            <Text style={s.companyDetail}>Org.nr. 930 985 589</Text>
            <Text style={s.companyDetail}>{store.address}</Text>
            <Text style={s.companyDetail}>{store.postalCode} {store.city}</Text>
            <Text style={s.companyDetail}>{store.phone}</Text>
            <Text style={s.companyDetail}>{store.email}</Text>
          </View>
          <Text style={s.docTitle}>FAKTURA</Text>
        </View>

        {/* ── Meta row ───────────────────────────────────────────── */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Fakturanr.</Text>
            <Text style={s.metaValue}>{data.invoiceNumber}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Fakturadato</Text>
            <Text style={s.metaValue}>{fmtDate(data.issuedAt)}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Forfallsdato</Text>
            <Text style={s.metaValue}>{fmtDate(data.dueDate)}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>KID</Text>
            <Text style={s.metaValue}>{data.kidNumber}</Text>
          </View>
        </View>

        {/* ── Bill-to ─────────────────────────────────────────────── */}
        <View style={s.billTo}>
          <Text style={s.billToLabel}>Fakturamottaker</Text>
          {customer.companyName ? (
            <Text style={s.billToLine}>{customer.companyName}</Text>
          ) : null}
          {customer.orgNumber ? (
            <Text style={s.billToSub}>Org.nr. {customer.orgNumber}</Text>
          ) : null}
          <Text style={s.billToLine}>{customer.fullName}</Text>
          {customer.address ? (
            <Text style={s.billToSub}>{customer.address}</Text>
          ) : null}
          {customer.postalCode && customer.city ? (
            <Text style={s.billToSub}>{customer.postalCode} {customer.city}</Text>
          ) : null}
          <Text style={s.billToSub}>{customer.email}</Text>
        </View>

        {/* ── Line-items table ─────────────────────────────────────── */}
        <View style={s.tableHeaderRow}>
          <Text style={[s.colSku, s.colHeaderText]}>Varenr.</Text>
          <Text style={[s.colDesc, s.colHeaderText]}>Beskrivelse</Text>
          <Text style={[s.colQty, s.colHeaderText]}>Ant.</Text>
          <Text style={[s.colUnit, s.colHeaderText]}>Enhetspris eks.</Text>
          <Text style={[s.colMva, s.colHeaderText]}>MVA%</Text>
          <Text style={[s.colTotal, s.colHeaderText]}>Beløp eks. MVA</Text>
        </View>

        {items.map((item, i) => (
          <View key={item.sku} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={s.colSku}>{item.sku}</Text>
            <Text style={s.colDesc}>{item.productName}</Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            <Text style={s.colUnit}>{kr(item.unitPriceExclMva)}</Text>
            <Text style={s.colMva}>{Math.round(toNum(item.mvaRate) * 100)}%</Text>
            <Text style={s.colTotal}>{kr(item.lineTotalExclMva)}</Text>
          </View>
        ))}

        {/* ── Totals ──────────────────────────────────────────────── */}
        <View style={s.totalsWrapper}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Sum eks. MVA</Text>
            <Text>{kr(data.subtotalExclMva)}</Text>
          </View>
          {toNum(data.shippingCost) > 0 ? (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Frakt eks. MVA</Text>
              <Text>{kr(data.shippingCost)}</Text>
            </View>
          ) : null}
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>MVA {mvaPercent}%</Text>
            <Text>{kr(data.mvaAmount)}</Text>
          </View>
          <View style={s.totalsRowFinal}>
            <Text style={s.totalsBold}>Totalt inkl. MVA</Text>
            <Text style={s.totalsBold}>{kr(data.totalPrice)}</Text>
          </View>
        </View>

        {/* ── Payment info ─────────────────────────────────────────── */}
        <View style={s.payBox}>
          <View>
            <Text style={s.payLabel}>Betalingsfrist</Text>
            <Text style={s.payValue}>{fmtDate(data.dueDate)}</Text>
          </View>
          <View>
            <Text style={s.payLabel}>KID-nummer</Text>
            <Text style={s.payValue}>{data.kidNumber}</Text>
          </View>
          <View>
            <Text style={s.payLabel}>Merk betaling med</Text>
            <Text style={s.payValue}>Faktura {data.invoiceNumber}</Text>
          </View>
        </View>

        {/* ── Footer (repeats on every page) ───────────────────────── */}
        <View style={s.footer} fixed>
          <Text>Dyvika Maskin AS · Org.nr. 930 985 589</Text>
          <Text>Faktura {data.invoiceNumber}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Side ${pageNumber} av ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render a Norwegian faktura PDF and return it as a Node.js Buffer.
 * Call from a Route Handler — not a React Server Component.
 */
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
