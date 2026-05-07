/**
 * Picking list PDF generator
 *
 * Generates a warehouse picking list for a sale order.
 * Items are sorted by location code so staff can walk
 * the warehouse in one efficient pass.
 *
 * Columns: Location code | SKU | Product | Qty | ✓ (checkbox)
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { locationCodeLabel } from "@/lib/location-code";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickingLineItem {
  locationCode: string | null;
  sku:          string;
  productName:  string;
  quantity:     number;
}

export interface PickingListData {
  saleId:       string;
  orderSource:  string;
  createdAt:    Date;
  storeName:    string;
  customerName: string;
  customerEmail:string;
  isPickup:     boolean;
  items:        PickingLineItem[];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
  },
  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  title:     { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  subtitle:  { fontSize: 9, color: "#64748b", marginTop: 2 },
  metaBlock: { alignItems: "flex-end" },
  metaLine:  { fontSize: 8, color: "#475569", marginBottom: 1 },
  divider:   { borderBottom: "1pt solid #e2e8f0", marginVertical: 10 },
  // Customer + store
  infoRow:   { flexDirection: "row", gap: 24, marginBottom: 12 },
  infoBox:   { flex: 1 },
  infoLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 9, color: "#1e293b" },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottom: "0.5pt solid #f1f5f9",
    alignItems: "center",
    minHeight: 20,
  },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  td: { fontSize: 8.5, color: "#1e293b" },
  // Column widths
  colLocation: { width: "28%" },
  colSku:      { width: "16%" },
  colName:     { width: "38%" },
  colQty:      { width: "10%", textAlign: "right" },
  colCheck:    { width: "8%",  textAlign: "center" },
  // Checkbox
  checkbox:    { width: 10, height: 10, border: "1pt solid #94a3b8", borderRadius: 1 },
  // Footer
  footer:      { position: "absolute", bottom: 24, left: 36, right: 36 },
  footerRow:   { flexDirection: "row", justifyContent: "space-between", borderTop: "0.5pt solid #e2e8f0", paddingTop: 6 },
  footerText:  { fontSize: 7, color: "#94a3b8" },
  // Summary
  summaryRow:  { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, gap: 24 },
  summaryBox:  { flexDirection: "row", gap: 6, alignItems: "baseline" },
  summaryLabel:{ fontSize: 8, color: "#64748b" },
  summaryValue:{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  // "No location" note
  noLocNote: { fontSize: 7.5, color: "#f59e0b", fontFamily: "Helvetica-Bold" },
});

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortItems(items: PickingLineItem[]): PickingLineItem[] {
  return [...items].sort((a, b) => {
    if (!a.locationCode && !b.locationCode) return a.sku.localeCompare(b.sku);
    if (!a.locationCode) return 1;
    if (!b.locationCode) return -1;
    return a.locationCode.localeCompare(b.locationCode);
  });
}

// ─── Document ─────────────────────────────────────────────────────────────────

function PickingListDocument({ data }: { data: PickingListData }) {
  const sorted = sortItems(data.items);
  const totalQty = sorted.reduce((s, i) => s + i.quantity, 0);
  const missingLoc = sorted.filter((i) => !i.locationCode).length;

  return (
    <Document title={`Plukkliste – ${data.saleId.slice(0, 8)}`} author="Dyvika Maskin AS">
      <Page size="A4" style={styles.page}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Plukkliste</Text>
            <Text style={styles.subtitle}>
              {data.orderSource === "PHONE" ? "Telefonordre" : "Nettordre"}{" "}
              {data.isPickup ? "· Hentes i butikk" : "· Levering"}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLine}>Ordre-ID: {data.saleId.slice(0, 10)}…</Text>
            <Text style={styles.metaLine}>
              Dato: {data.createdAt.toLocaleDateString("nb-NO")}
            </Text>
            <Text style={styles.metaLine}>Lager: {data.storeName}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Customer + warning ─────────────────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Kunde</Text>
            <Text style={styles.infoValue}>{data.customerName}</Text>
            <Text style={[styles.infoValue, { color: "#64748b" }]}>{data.customerEmail}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Lager</Text>
            <Text style={styles.infoValue}>{data.storeName}</Text>
          </View>
          {missingLoc > 0 && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}> </Text>
              <Text style={styles.noLocNote}>
                ⚠ {missingLoc} vare{missingLoc > 1 ? "r" : ""} mangler lokasjonskode
              </Text>
            </View>
          )}
        </View>

        {/* ── Table ──────────────────────────────────────────────────── */}
        {/* Header row */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colLocation]}>Lokasjon</Text>
          <Text style={[styles.th, styles.colSku]}>SKU</Text>
          <Text style={[styles.th, styles.colName]}>Produktnavn</Text>
          <Text style={[styles.th, styles.colQty]}>Ant.</Text>
          <Text style={[styles.th, styles.colCheck]}>✓</Text>
        </View>

        {sorted.map((item, idx) => (
          <View
            key={idx}
            style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={[styles.td, styles.colLocation]}>
              {item.locationCode ?? (
                <Text style={{ color: "#f59e0b" }}>– ikke satt –</Text>
              )}
            </Text>
            <Text style={[styles.td, styles.colSku, { fontFamily: "Helvetica-Bold" }]}>
              {item.sku}
            </Text>
            <Text style={[styles.td, styles.colName]}>{item.productName}</Text>
            <Text style={[styles.td, styles.colQty, { fontFamily: "Helvetica-Bold" }]}>
              {item.quantity}
            </Text>
            <View style={[styles.colCheck, { alignItems: "center" }]}>
              <View style={styles.checkbox} />
            </View>
          </View>
        ))}

        {/* ── Summary ────────────────────────────────────────────────── */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Unike varer:</Text>
            <Text style={styles.summaryValue}>{sorted.length}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Totalt antall:</Text>
            <Text style={styles.summaryValue}>{totalQty}</Text>
          </View>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              Dyvika Maskin AS · Plukkliste generert {new Date().toLocaleString("nb-NO")}
            </Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }) =>
                `Side ${pageNumber} av ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ─── Public render function ───────────────────────────────────────────────────

export async function renderPickingListPdf(data: PickingListData): Promise<Buffer> {
  const buffer = await renderToBuffer(<PickingListDocument data={data} />);
  return Buffer.from(buffer);
}
