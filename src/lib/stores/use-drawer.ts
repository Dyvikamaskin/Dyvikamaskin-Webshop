"use client";

import { create } from "zustand";

/**
 * Storefront drawer (hamburger) open/close state — Phase 0.5.
 *
 * Lifted out of CategoryDrawer so the TopBar's hamburger button can
 * trigger it without prop drilling.
 */
interface DrawerStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useDrawerStore = create<DrawerStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
