"use client";

/**
 * QR/barcode scanner panel for stocktake sessions.
 *
 * Uses html5-qrcode (already installed) to read from the device camera.
 * When a code is scanned:
 *   1. Treats it as a product SKU
 *   2. Looks it up in the session items passed as props
 *   3. Highlights that row and focuses the quantity input
 *   4. Staff enters the counted quantity and presses "Lagre"
 *
 * Works in parallel with manual search — staff can also type a SKU
 * directly into the search box without using the camera.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { recordScanAction } from "@/app/actions/stocktake";

export interface SessionItem {
  id:               string;
  productId:        string;
  sku:              string;
  partNumber:       string | null;
  productName:      string;
  locationCode:     string | null;
  expectedQuantity: number;
  countedQuantity:  number;
  discrepancy:      number;
  isScanned:        boolean; // countedQuantity was explicitly set
}

interface Props {
  sessionId: string;
  isBlind:   boolean;
  items:     SessionItem[];
}

export default function ScannerPanel({ sessionId, isBlind, items }: Props) {
  const [isPending, startTransition] = useTransition();
  const [scannerActive, setScannerActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeItem, setActiveItem] = useState<SessionItem | null>(null);
  const [countInput, setCountInput] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [localItems, setLocalItems] = useState<SessionItem[]>(items);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);
  const countInputRef = useRef<HTMLInputElement>(null);

  // ── Item lookup ────────────────────────────────────────────────────────────
  function findBySku(sku: string): SessionItem | undefined {
    return localItems.find((i) => i.sku.toLowerCase() === sku.toLowerCase().trim());
  }

  function selectItem(item: SessionItem) {
    setActiveItem(item);
    setCountInput(item.isScanned ? item.countedQuantity : item.expectedQuantity);
    setFeedback(null);
    setTimeout(() => countInputRef.current?.focus(), 80);
  }

  // ── Handle scanned code ────────────────────────────────────────────────────
  function handleScannedCode(code: string) {
    const item = findBySku(code);
    if (!item) {
      setFeedback({ type: "err", msg: `SKU «${code}» ikke funnet i denne varetelling.` });
      return;
    }
    selectItem(item);
    setFeedback({ type: "ok", msg: `Funnet: ${item.productName}` });
  }

  // ── Camera scanner lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    if (!scannerActive) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5Qr: any = null;

    async function startCamera() {
      if (!scannerDivRef.current) return;
      const { Html5Qrcode } = await import("html5-qrcode");
      html5Qr = new Html5Qrcode("stocktake-qr-reader");
      html5QrRef.current = html5Qr;
      try {
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 100 } },
          (decodedText: string) => { handleScannedCode(decodedText); },
          undefined
        );
      } catch {
        setFeedback({ type: "err", msg: "Kamera ikke tilgjengelig." });
        setScannerActive(false);
      }
    }

    startCamera();

    return () => {
      (async () => {
        try { await html5Qr?.stop(); html5Qr?.clear(); } catch { /* ignore */ }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerActive]);

  // ── Save scan ──────────────────────────────────────────────────────────────
  function handleSave() {
    if (!activeItem) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await recordScanAction(sessionId, activeItem.productId, countInput);
      if (!result.ok) {
        setFeedback({ type: "err", msg: result.error });
        return;
      }
      // Update local state optimistically
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === activeItem.id
            ? {
                ...i,
                countedQuantity: countInput,
                discrepancy: countInput - i.expectedQuantity,
                isScanned: true,
              }
            : i
        )
      );
      setFeedback({ type: "ok", msg: `✓ Lagret: ${activeItem.productName} – antall: ${countInput}` });
      setActiveItem(null);
      setSearchQuery("");
    });
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const scannedCount   = localItems.filter((i) => i.isScanned).length;
  const discrepancies  = localItems.filter((i) => i.isScanned && i.discrepancy !== 0).length;
  const filtered       = searchQuery
    ? localItems.filter(
        (i) =>
          i.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (i.locationCode?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : localItems;

  return (
    <div>
      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1.25rem" }}>
        <Stat label="Totalt" value={localItems.length} />
        <Stat label="Scannet" value={scannedCount} color="#166534" />
        <Stat label="Gjenstår" value={localItems.length - scannedCount} color={localItems.length - scannedCount > 0 ? "#92400e" : "#166534"} />
        <Stat label="Avvik" value={discrepancies} color={discrepancies > 0 ? "#991b1b" : "#166534"} />
      </div>

      <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "999px", marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((scannedCount / Math.max(localItems.length, 1)) * 100)}%`, background: "#2563eb", borderRadius: "999px", transition: "width 0.3s" }} />
      </div>

      {/* ── Scanner controls ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => setScannerActive((v) => !v)}
          style={{
            padding: "0.5rem 1.25rem",
            background: scannerActive ? "#dc2626" : "#0f172a",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          {scannerActive ? "⏹ Stopp kamera" : "📷 Start QR-skanning"}
        </button>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            const found = findBySku(e.target.value.trim());
            if (found) selectItem(found);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const found = findBySku(searchQuery.trim());
              if (found) selectItem(found);
              else setFeedback({ type: "err", msg: `«${searchQuery}» ikke funnet.` });
            }
          }}
          placeholder="Søk / scan SKU eller lokasjonskode…"
          style={{
            flex: 1,
            minWidth: "220px",
            padding: "0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "0.875rem",
          }}
        />
      </div>

      {/* Camera viewfinder */}
      {scannerActive && (
        <div
          id="stocktake-qr-reader"
          ref={scannerDivRef}
          style={{ width: "100%", maxWidth: "360px", marginBottom: "1rem", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" }}
        />
      )}

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      {feedback && (
        <div style={{
          padding: "0.625rem 1rem",
          marginBottom: "1rem",
          borderRadius: "6px",
          fontSize: "0.875rem",
          background: feedback.type === "ok" ? "#f0fdf4" : "#fef2f2",
          color:      feedback.type === "ok" ? "#166534"  : "#991b1b",
          border: `1px solid ${feedback.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
        }}>
          {feedback.msg}
        </div>
      )}

      {/* ── Active item — count entry ──────────────────────────────────────── */}
      {activeItem && (
        <div style={{ background: "#eff6ff", border: "2px solid #3b82f6", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: "#1e3a8a" }}>{activeItem.productName}</p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#2563eb" }}>
                SKU: {activeItem.sku}
                {activeItem.locationCode && <span> · 📍 {activeItem.locationCode}</span>}
              </p>
            </div>
            <button onClick={() => setActiveItem(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "#64748b" }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.8rem", fontWeight: 600, color: "#1e40af" }}>
              {isBlind ? "Antall talt" : `Antall talt (forventet: ${activeItem.expectedQuantity})`}
              <input
                ref={countInputRef}
                type="number"
                min={0}
                value={countInput}
                onChange={(e) => setCountInput(parseInt(e.target.value, 10) || 0)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                style={{ padding: "0.5rem 0.75rem", border: "2px solid #3b82f6", borderRadius: "6px", fontSize: "1.1rem", fontWeight: 700, width: "100px", color: "#1e293b" }}
              />
            </label>
            <button
              onClick={handleSave}
              disabled={isPending}
              style={{ padding: "0.5rem 1.5rem", background: isPending ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem", height: "40px" }}
            >
              {isPending ? "…" : "Lagre"}
            </button>
          </div>
        </div>
      )}

      {/* ── Item table ────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Lokasjon", "SKU", "Produkt", ...(isBlind ? [] : ["Forventet"]), "Talt", "Avvik", ""].map((h) => (
                <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: h === "Forventet" || h === "Talt" || h === "Avvik" ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const isActive = activeItem?.id === item.id;
              const hasDisc  = item.isScanned && item.discrepancy !== 0;
              return (
                <tr
                  key={item.id}
                  onClick={() => selectItem(item)}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    background: isActive ? "#eff6ff" : item.isScanned ? "#f0fdf4" : "#fff",
                  }}
                >
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    {item.locationCode ? (
                      <code style={{ fontSize: "0.75rem", background: "#f0fdf4", color: "#166534", padding: "0.1rem 0.35rem", borderRadius: "3px" }}>
                        {item.locationCode}
                      </code>
                    ) : (
                      <span style={{ color: "#f59e0b", fontSize: "0.75rem" }}>–</span>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#334155" }}>{item.sku}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#1e293b" }}>{item.productName}</td>
                  {!isBlind && (
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#64748b" }}>{item.expectedQuantity}</td>
                  )}
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: item.isScanned ? 700 : 400, color: item.isScanned ? "#166534" : "#94a3b8" }}>
                    {item.isScanned ? item.countedQuantity : "–"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700, color: hasDisc ? (item.discrepancy > 0 ? "#2563eb" : "#dc2626") : item.isScanned ? "#166534" : "#94a3b8" }}>
                    {item.isScanned ? (item.discrepancy === 0 ? "✓" : (item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy)) : "–"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    {isActive && <span style={{ fontSize: "0.7rem", color: "#2563eb", fontWeight: 700 }}>● aktiv</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color = "#1e293b" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0.75rem 1rem", minWidth: "80px" }}>
      <p style={{ margin: 0, fontSize: "0.7rem", color: "#64748b", marginBottom: "0.2rem" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color }}>{value}</p>
    </div>
  );
}
