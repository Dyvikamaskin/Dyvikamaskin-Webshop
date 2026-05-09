"use client";

import { create } from "zustand";

/**
 * Scanner-modal open/close state — Phase 0.5.
 *
 * Lifted out of StorefrontScanner so the new TopBar trigger and any other
 * caller (admin, product detail, future barcode-rescan) can open the
 * scanner without prop drilling.
 */
interface ScannerStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useScannerStore = create<ScannerStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
