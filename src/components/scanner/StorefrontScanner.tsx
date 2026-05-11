"use client";

/**
 * StorefrontScanner
 *
 * A floating scan panel for the customer-facing storefront.
 *
 * Supports two input methods:
 *   1. Physical HID barcode scanner (keydown listener via useBarcodeScannerInput)
 *   2. Camera-based QR/barcode scanning via html5-qrcode
 *
 * Flow:
 *   scan code → GET /api/products/lookup?code=XXX
 *     found    → navigate to /produkter/[sku]
 *     not found → show "request product" form → POST submitProductRequestAction
 */

import { useState, useEffect, useRef, useTransition } from "react";
import { useBarcodeScannerInput } from "@/lib/use-barcode-scanner";
import { useScannerStore } from "@/lib/stores/use-scanner";
import { submitProductRequestAction } from "@/app/actions/product-draft";

interface ProductHit {
  id:       string;
  sku:      string;
  name:     string;
  brand:    string | null;
  priceBase: string;
  mainImage: string | null;
}

type State =
  | { phase: "idle" }
  | { phase: "searching"; code: string }
  | { phase: "found";    product: ProductHit }
  | { phase: "notfound"; code: string }
  | { phase: "requested" };

export default function StorefrontScanner() {
  const open       = useScannerStore((s) => s.isOpen);
  const closeModal = useScannerStore((s) => s.close);
  const [state,     setState]     = useState<State>({ phase: "idle" });
  const [cameraOn,  setCameraOn]  = useState(false);
  const [email,     setEmail]     = useState("");
  const [notes,     setNotes]     = useState("");
  const [reqPending, startReq]    = useTransition();
  const [reqError,  setReqError]  = useState<string | null>(null);

  const scannerDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrRef    = useRef<any>(null);

  // ── HID scanner hook ────────────────────────────────────────────────────────
  useBarcodeScannerInput({
    onScan:  handleCode,
    enabled: open,
  });

  // ── Look up a scanned/typed code ────────────────────────────────────────────
  async function handleCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setState({ phase: "searching", code: trimmed });
    try {
      const res  = await fetch(`/api/products/lookup?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.found) {
        setState({ phase: "found", product: data.product });
      } else {
        setState({ phase: "notfound", code: trimmed });
      }
    } catch {
      setState({ phase: "notfound", code: trimmed });
    }
  }

  // ── Camera lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraOn) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let h5q: any = null;

    async function start() {
      if (!scannerDivRef.current) return;
      const { Html5Qrcode } = await import("html5-qrcode");
      h5q = new Html5Qrcode("storefront-qr-reader");
      html5QrRef.current = h5q;
      try {
        await h5q.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 220, height: 100 } },
          (decoded: string) => { handleCode(decoded); },
          undefined
        );
      } catch {
        setCameraOn(false);
      }
    }
    start();
    return () => {
      (async () => { try { await h5q?.stop(); h5q?.clear(); } catch { /* ignore */ } })();
    };
     
  }, [cameraOn]);

  // ── Navigate to product ─────────────────────────────────────────────────────
  function goToProduct(sku: string) {
    window.location.href = `/produkter/${encodeURIComponent(sku)}`;
  }

  // ── Submit request for unknown product ─────────────────────────────────────
  function handleRequest() {
    if (state.phase !== "notfound") return;
    setReqError(null);
    const code = state.code;
    startReq(async () => {
      const result = await submitProductRequestAction(
        code,
        email.trim() || null,
        notes.trim() || null
      );
      if (!result.ok) { setReqError(result.error); return; }
      setState({ phase: "requested" });
    });
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  function reset() {
    setState({ phase: "idle" });
    setEmail(""); setNotes(""); setReqError(null);
  }

  // The floating "open" button is gone in Phase 0.5 — the scanner trigger
  // now lives in the new TopBar's scanner icon. We render only the modal
  // when the store says open.
  if (!open) return null;

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 1000,
      background: "#fff", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      width: "min(360px, calc(100vw - 2rem))", border: "1px solid #e2e8f0",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.875rem 1rem", borderBottom: "1px solid #f1f5f9", background: "#0f172a", borderRadius: "12px 12px 0 0" }}>
        <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "0.9rem" }}>📷 Skann produkt</span>
        <button onClick={() => { closeModal(); setCameraOn(false); reset(); }}
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
      </div>

      <div style={{ padding: "1rem" }}>
        {/* Camera toggle */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.875rem" }}>
          <button
            onClick={() => setCameraOn((v) => !v)}
            style={{
              flex: 1, padding: "0.5rem", fontSize: "0.8rem", fontWeight: 600,
              background: cameraOn ? "#dc2626" : "#f1f5f9",
              color: cameraOn ? "#fff" : "#374151",
              border: "1px solid " + (cameraOn ? "#dc2626" : "#d1d5db"),
              borderRadius: "6px", cursor: "pointer",
            }}
          >
            {cameraOn ? "⏹ Stopp kamera" : "📷 Bruk kamera"}
          </button>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", background: "#f1f5f9", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer", color: "#374151" }}
          >
            Nullstill
          </button>
        </div>

        {cameraOn && (
          <div id="storefront-qr-reader" ref={scannerDivRef}
            style={{ width: "100%", borderRadius: "6px", overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: "0.875rem" }} />
        )}

        {/* Manual input */}
        <ManualInput onSubmit={handleCode} />

        {/* State output */}
        {state.phase === "searching" && (
          <p style={infoStyle("#e0f2fe", "#0369a1")}>🔍 Søker etter «{state.code}»…</p>
        )}

        {state.phase === "found" && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px" }}>
            {state.product.mainImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.product.mainImage} alt="" style={{ height: "60px", objectFit: "contain", float: "right", marginLeft: "0.5rem" }} />
            )}
            <p style={{ margin: "0 0 0.25rem", fontWeight: 700, fontSize: "0.875rem", color: "#166534" }}>{state.product.name}</p>
            {state.product.brand && <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "#64748b" }}>{state.product.brand}</p>}
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "#374151" }}>SKU: {state.product.sku}</p>
            <button
              onClick={() => goToProduct(state.phase === "found" ? state.product.sku : "")}
              style={{ width: "100%", padding: "0.5rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}
            >
              Se produktet →
            </button>
          </div>
        )}

        {state.phase === "notfound" && (
          <div style={{ marginTop: "0.75rem" }}>
            <p style={infoStyle("#fef9c3", "#713f12")}>Kode «{state.code}» ble ikke funnet i katalogen.</p>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0.5rem 0" }}>
              Vil du be oss legge til produktet? Oppgi e-postadressen din så varsler vi deg.
            </p>
            <input
              type="email" placeholder="Din e-post (valgfri)" value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "0.45rem 0.6rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.8rem", marginBottom: "0.5rem", boxSizing: "border-box" }}
            />
            <textarea
              placeholder="Tilleggsinfo om produktet (valgfri)" value={notes}
              onChange={(e) => setNotes(e.target.value)} rows={2}
              style={{ width: "100%", padding: "0.45rem 0.6rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.8rem", resize: "none", marginBottom: "0.5rem", boxSizing: "border-box" }}
            />
            {reqError && <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>{reqError}</p>}
            <button
              onClick={handleRequest} disabled={reqPending}
              style={{ width: "100%", padding: "0.5rem", background: reqPending ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}
            >
              {reqPending ? "Sender forespørsel…" : "Be om produktet"}
            </button>
          </div>
        )}

        {state.phase === "requested" && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#166534", fontSize: "0.875rem" }}>✓ Forespørsel mottatt!</p>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#374151" }}>
              Vi behandler forespørselen og varsler deg når produktet er tilgjengelig.
            </p>
            <button onClick={reset} style={{ marginTop: "0.75rem", padding: "0.4rem 1rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}>
              Skann ny kode
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Manual input sub-component ──────────────────────────────────────────────

function ManualInput({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("");

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      onSubmit(value.trim());
      setValue("");
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.4rem" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Skriv inn eller scan SKU / strekkode…"
        style={{ flex: 1, padding: "0.45rem 0.6rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.8rem" }}
      />
      <button
        onClick={() => { if (value.trim()) { onSubmit(value.trim()); setValue(""); } }}
        style={{ padding: "0.45rem 0.75rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
      >
        Søk
      </button>
    </div>
  );
}

function infoStyle(bg: string, color: string): React.CSSProperties {
  return {
    marginTop: "0.625rem", padding: "0.5rem 0.75rem", borderRadius: "6px",
    fontSize: "0.8rem", background: bg, color,
  };
}
