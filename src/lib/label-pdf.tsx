/**
 * Warehouse label PDF generator
 *
 * Produces an A4 sheet of 8 labels (2 columns × 4 rows).
 * Each label shows:
 *   - Location code (large, bold) + QR code of location code
 *   - Zone colour band and aisle/rack/shelf/slot breakdown
 *   - SKU + part number + product name
 *   - QR code of the SKU for scanning
 *   - Store name
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import { parseLocationCode, LOCATION_ZONES } from "@/lib/location-code";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelData {
  locationCode: string | null;
  sku: string;
  partNumber?: string | null;
  productName: string;
  storeName: string;
}

interface ResolvedLabel extends LabelData {
  locationQR: string; // base64 data URL
  skuQR: string;      // base64 data URL
}

// ─── Zone colours ─────────────────────────────────────────────────────────────

const ZONE_COLOUR: Record<string, string> = {
  PLUKK:    "#1d4ed8",
  HØYLAGER: "#6d28d9",
  UTE:      "#065f46",
  INNLEV:   "#92400e",
  KAR:      "#991b1b",
  RETUR:    "#374151",
};

function zoneColour(code: string | null): string {
  if (!code) return "#64748b";
  const parts = parseLocationCode(code);
  return ZONE_COLOUR[parts?.zone ?? ""] ?? "#64748b";
}

function zoneName(code: string | null): string {
  if (!code) return "INGEN LOKASJON";
  const parts = parseLocationCode(code);
  if (!parts) return code;
  return LOCATION_ZONES.find((z) => z.value === parts.zone)?.label ?? parts.zone;
}

// ─── QR helper ────────────────────────────────────────────────────────────────

async function toQR(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 120,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// A4: 595.28 × 841.89 pt
// 2 cols × 4 rows; outer margin 18pt; gap 9pt
const COL = 2;
const ROW = 4;
const OUTER = 18;
const GAP = 9;
const LABEL_W = (595.28 - OUTER * 2 - GAP * (COL - 1)) / COL; // ≈ 265pt
const LABEL_H = (841.89 - OUTER * 2 - GAP * (ROW - 1)) / ROW; // ≈ 193pt

const styles = StyleSheet.create({
  page: {
    padding: OUTER,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  label: {
    width: LABEL_W,
    height: LABEL_H,
    border: "1pt solid #cbd5e1",
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },
  // ── Header band ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 38,
  },
  headerLeft: {
    flex: 1,
  },
  zoneName: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationCode: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  locationQR: {
    width: 48,
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 2,
    padding: 2,
  },
  // ── Breakdown row ──
  breakdown: {
    flexDirection: "row",
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
    borderTop: "0.5pt solid #e2e8f0",
    borderBottom: "0.5pt solid #e2e8f0",
    gap: 8,
  },
  breakdownItem: {
    flexDirection: "column",
    alignItems: "center",
  },
  breakdownLabel: {
    fontSize: 5.5,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  breakdownValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  // ── Product body ──
  body: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 6,
  },
  productInfo: {
    flex: 1,
    flexDirection: "column",
    gap: 3,
  },
  skuText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  partText: {
    fontSize: 7.5,
    color: "#475569",
  },
  nameText: {
    fontSize: 7.5,
    color: "#1e293b",
    lineHeight: 1.3,
  },
  skuQRBlock: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  skuQR: {
    width: 42,
    height: 42,
    backgroundColor: "#ffffff",
  },
  skuQRLabel: {
    fontSize: 5,
    color: "#94a3b8",
  },
  // ── Footer ──
  footer: {
    borderTop: "0.5pt solid #e2e8f0",
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#f8fafc",
  },
  footerText: {
    fontSize: 6,
    color: "#94a3b8",
  },
});

// ─── Single Label Component ───────────────────────────────────────────────────

function Label({ label }: { label: ResolvedLabel }) {
  const colour = zoneColour(label.locationCode);
  const parts = label.locationCode ? parseLocationCode(label.locationCode) : null;
  const truncName =
    label.productName.length > 60
      ? label.productName.slice(0, 57) + "…"
      : label.productName;

  return (
    <View style={styles.label}>
      {/* Header band */}
      <View style={[styles.header, { backgroundColor: colour }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.zoneName}>{zoneName(label.locationCode)}</Text>
          <Text style={styles.locationCode}>
            {label.locationCode ?? "INGEN KODE"}
          </Text>
        </View>
        <Image style={styles.locationQR} src={label.locationQR} />
      </View>

      {/* Breakdown row */}
      {parts && (
        <View style={styles.breakdown}>
          {[
            { l: "Gang",  v: parts.aisle },
            { l: "Reol",  v: parts.rack  },
            { l: "Nivå",  v: parts.shelf },
            { l: "Plass", v: parts.slot  },
          ].map(({ l, v }) => (
            <View key={l} style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>{l}</Text>
              <Text style={styles.breakdownValue}>{v}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Product body */}
      <View style={styles.body}>
        <View style={styles.productInfo}>
          <Text style={styles.skuText}>{label.sku}</Text>
          {label.partNumber && label.partNumber !== label.sku && (
            <Text style={styles.partText}>Art.nr: {label.partNumber}</Text>
          )}
          <Text style={styles.nameText}>{truncName}</Text>
        </View>
        <View style={styles.skuQRBlock}>
          <Image style={styles.skuQR} src={label.skuQR} />
          <Text style={styles.skuQRLabel}>SKU</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>{label.storeName}</Text>
      </View>
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────

function LabelDocument({ labels }: { labels: ResolvedLabel[] }) {
  // Chunk into pages of 8
  const pages: ResolvedLabel[][] = [];
  for (let i = 0; i < labels.length; i += 8) {
    pages.push(labels.slice(i, i + 8));
  }

  return (
    <Document title="Lagerlapper" author="Dyvika Maskin AS">
      {pages.map((page, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          <View style={styles.grid}>
            {page.map((label, li) => (
              <Label key={li} label={label} />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}

// ─── Public render function ───────────────────────────────────────────────────

export async function renderLabelsPdf(labels: LabelData[]): Promise<Buffer> {
  if (labels.length === 0) throw new Error("Ingen etiketter valgt.");

  // Pre-generate all QR codes (async outside React render)
  const resolved: ResolvedLabel[] = await Promise.all(
    labels.map(async (l) => ({
      ...l,
      locationQR: await toQR(l.locationCode ?? l.sku),
      skuQR:      await toQR(l.sku),
    }))
  );

  const buffer = await renderToBuffer(<LabelDocument labels={resolved} />);
  return Buffer.from(buffer);
}
