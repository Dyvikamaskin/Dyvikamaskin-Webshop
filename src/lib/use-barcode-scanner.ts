"use client";

/**
 * useBarcodeScannerInput — shared hook for physical HID barcode scanners.
 *
 * Physical HID scanners (USB/Bluetooth) inject key presses directly into the
 * focused document. They emit the barcode characters very rapidly (typically
 * < 50 ms between keystrokes) followed by an Enter keystroke.
 *
 * Strategy
 * ─────────
 * • Listen to `keydown` on the document.
 * • Buffer characters that arrive within SCAN_INTERVAL_MS of each other.
 * • When Enter is detected (or no key arrives within the timeout), treat
 *   the accumulated string as a scanned code.
 * • Ignore single-character sequences (accidental key presses).
 *
 * Camera-based scanning is handled separately by html5-qrcode in the
 * components that need it (ScannerPanel, etc.).
 */

import { useEffect, useRef, useCallback } from "react";

const SCAN_INTERVAL_MS = 50;  // max gap between scanner keystrokes
const MIN_CODE_LENGTH  = 3;   // ignore accidental single/double keypresses

interface Options {
  onScan: (code: string) => void;
  /** Set to false to pause listening (e.g. when a text input is focused). */
  enabled?: boolean;
}

export function useBarcodeScannerInput({ onScan, enabled = true }: Options) {
  const bufferRef   = useRef<string>("");
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef   = useRef(onScan);
  onScanRef.current = onScan;           // always latest without re-registering

  const flush = useCallback(() => {
    const code = bufferRef.current.trim();
    bufferRef.current = "";
    if (code.length >= MIN_CODE_LENGTH) {
      onScanRef.current(code);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore events that originate in text inputs / textareas so that
      // normal typing in a search box is not misinterpreted.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Enter") {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        flush();
        return;
      }

      // Only accumulate printable characters (length === 1)
      if (e.key.length !== 1) return;

      bufferRef.current += e.key;

      // Reset inactivity timer
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        flush();
        timerRef.current = null;
      }, SCAN_INTERVAL_MS * 3);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, flush]);
}
