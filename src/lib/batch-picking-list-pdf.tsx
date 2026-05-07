/**
 * Batch picking list PDF
 *
 * Generates a combined picking list for all orders in one batch slot.
 * Items are consolidated by SKU + location code and sorted by location
 * so a picker can walk the warehouse once for the entire batch.
 *
 * Each line shows: Location | SKU | Product name | Qty (total) | Order refs
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
import { compareLocationCodes } from "@/lib/location-code";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BatchOrderLine {
  saleId:      string;        // short reference for display
  locationCode: string | null;
  sku:          string;
  productName:  string;
  quantity:     number;
  customerName: string;
  isPickup:     boolean;
}

export interface BatchPickingListData {
  storeName:  string;
  batchSlot:  "MORGEN" | "ETTERMIDDAG";
  date:       string;          // "dd.mm.yyyy"
  orders:     { saleId: string; customerName: string; isPickup: boolean; itemCount: number }[];
  lines:      BatchOrderLine[];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9, color: "#1e293b" },
  headerRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  title:       { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  subtitle:    { fontSize: 9, color: "#64748b", marginTop: 2 },
  metaBlock:   { alignItems: "flex-end" },
  metaLine:    { fontSize: 8, color: "#475569", marginBottom: 1 },
  divider:     { borderBottom: "1pt solid #e2e8f0", marginVertical: 8 },
  // Order summary chips
  ordersRow:   { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  orderChip:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, border: "0.5pt solid #d1d5db", fontSize: 7 },
  orderChipPickup: { backgroundColor: "#fef9c3" },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableRow:    {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottom: "0.5pt solid #f1f5f9",
    alignItems: "center",
    minHeight: 20,
  },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  tableRowNoLoc: { backgroundColor: "#fffbeb" },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  td: { fontSize: 8.5, color: "#1e293b" },
  // Column widths
  colLocation: { width: "22%" },
  colSku:      { width: "14%" },
  colName:     { width: "30%" },
  colQty:      { width: "8%",  textAlign: "right" },
  colOrders:   { width: "18%" },
  colCheck:    { width: "8%",  textAlign: "center" },
  checkbox:    { width: 10, height: 10, border: "1pt solid #94a3b8", borderRadius: 1 },
  // Summary
  summaryRow:  { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, gap: 24 },
  summaryBox:  { flexDirection: "row", gap: 6, alignItems: "baseline" },
  summaryLabel:{ fontSize: 8, color: "#64748b" },
  summaryValue:{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  // Footer
  footer:      { position: "absolute", bottom: 24, left: 36, right: 36 },
  footerRow:   { flexDirection: "row", justifyContent: "space-between", borderTop: "0.5pt solid #e2e8f0", paddingTop: 6 },
  footerText:  { fontSize: 7, color: "#94a3b8" },
  noLocNote:   { fontSize: 7.5, color: "#f59e0b", fontFamily: "Helvetica-Bold" },
});

// ─── Consolidation logic ──────────────────────────────────────────────────────

interface ConsolidatedLine {
  locationCode: string | null;
  sku:          string;
  productName:  string;
  totalQty:     number;
  orderRefs:    string[];   // short IDs
}

function consolidateLines(lines: BatchOrderLine[]): ConsolidatedLine[] {
  const map = new Map<string, ConsolidatedLine>();

  for (const line of lines) {
    const key = `${line.sku}::${line.locationCode ?? ""}`;
    const existing = map.get(key);
    const shortId = line.saleId.slice(0, 8);
    if (existing) {
      existing.totalQty += line.quantity;
      if (!existing.orderRefs.includes(shortId)) existing.orderRefs.push(shortId);
    } else {
      map.set(key, {
        locationCode: line.locationCode,
        sku:          line.sku,
        productName:  line.productName,
        totalQty:     line.quantity,
        orderRefs:    [shortId],
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (!a.locationCode && !b.locationCode) return a.sku.localeCompare(b.sku);
    if (!a.locationCode) return 1;
    if (!b.locationCode) return -1;
    return compareLocationCodes(a.locationCode, b.locationCode);
  });
}

// ─── Document ─────────────────────────────────────────────────────────────────

function BatchPickingListDocument({ data }: { data: BatchPickingListData }) {
  const consolidated = consolidateLines(data.lines);
  const totalQty     = consolidated.reduce((s, l) => s + l.totalQty, 0);
  const missingLoc   = consolidated.filter((l) => !l.locationCode).length;
  const slotLabel    = data.batchSlot === "MORGEN" ? "Morgenbatch" : "Ettermiddagsbatch";

  return (
    <Document title={`Batch-plukkliste ${slotLabel} ${data.date}`} author="Dyvika Maskin AS">
      <Page size="A4" style={styles.page}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Batch-plukkliste</Text>
            <Text style={styles.subtitle}>{slotLabel} · {data.storeName}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLine}>Dato: {data.date}</Text>
            <Text style={styles.metaLine}>Ordrer: {data.orders.length}</Text>
            <Text style={styles.metaLine}>Unike linjer: {consolidated.length}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Order chips ─────────────────────────────────────────────── */}
        <View style={styles.ordersRow}>
          {data.orders.map((o) => (
            <View key={o.saleId} style={[styles.orderChip, o.isPickup ? styles.orderChipPickup : {}]}>
              <Text>
                {o.saleId.slice(0, 8)} – {o.customerName}
                {o.isPickup ? " [Hentes]" : ""}
              </Text>
            </View>
          ))}
        </View>

        {missingLoc > 0 && (
          <Text style={[styles.noLocNote, { marginBottom: 8 }]}>
            ⚠ {missingLoc} linje{missingLoc > 1 ? "r" : ""} mangler lokasjonskode — plassert sist
          </Text>
        )}

        {/* ── Table header ────────────────────────────────────────────── */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colLocation]}>Lokasjon</Text>
          <Text style={[styles.th, styles.colSku]}>SKU</Text>
          <Text style={[styles.th, styles.colName]}>Produktnavn</Text>
          <Text style={[styles.th, styles.colQty]}>Ant.</Text>
          <Text style={[styles.th, styles.colOrders]}>Ordrer</Text>
          <Text style={[styles.th, styles.colCheck]}>✓</Text>
        </View>

        {/* ── Rows ────────────────────────────────────────────────────── */}
        {consolidated.map((line, idx) => (
          <View
            key={idx}
            style={[
              styles.tableRow,
              !line.locationCode ? styles.tableRowNoLoc : (idx % 2 === 1 ? styles.tableRowAlt : {}),
            ]}
          >
            <Text style={[styles.td, styles.colLocation]}>
              {line.locationCode ?? "– ikke satt –"}
            </Text>
            <Text style={[styles.td, styles.colSku, { fontFamily: "Helvetica-Bold" }]}>
              {line.sku}
            </Text>
            <Text style={[styles.td, styles.colName]}>{line.productName}</Text>
            <Text style={[styles.td, styles.colQty, { fontFamily: "Helvetica-Bold" }]}>
              {line.totalQty}
            </Text>
            <Text style={[styles.td, styles.colOrders, { fontSize: 7, color: "#64748b" }]}>
              {line.orderRefs.join(", ")}
            </Text>
            <View style={[styles.colCheck, { alignItems: "center" }]}>
              <View style={styles.checkbox} />
            </View>
          </View>
        ))}

        {/* ── Summary ─────────────────────────────────────────────────── */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Unike linjer:</Text>
            <Text style={styles.summaryValue}>{consolidated.length}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Totalt antall:</Text>
            <Text style={styles.summaryValue}>{totalQty}</Text>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              Dyvika Maskin AS · Generert {new Date().toLocaleString("nb-NO")}
            </Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }) => `Side ${pageNumber} av ${totalPages}`}
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ─── Public render function ───────────────────────────────────────────────────

export async function renderBatchPickingListPdf(data: BatchPickingListData): Promise<Buffer> {
  const buffer = await renderToBuffer(<BatchPickingListDocument data={data} />);
  return Buffer.from(buffer);
}
