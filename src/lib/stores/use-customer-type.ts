"use client";

import { create } from "zustand";

/**
 * Client-side Zustand store for customer type and modal state.
 * Persistence is handled server-side via a cookie (customer-type).
 * This store is purely for reactive UI — initialise from the cookie value
 * on mount (see EntryModal / LocaleLayout).
 */

export type CustomerTypeValue = "CONSUMER" | "BUSINESS";

interface CustomerTypeStore {
  /** null = not yet selected (show entry modal) */
  customerType: CustomerTypeValue | null;
  isEntryModalOpen: boolean;

  setCustomerType: (type: CustomerTypeValue) => void;
  openEntryModal: () => void;
  closeEntryModal: () => void;
  /** Called once on mount to hydrate from the server-rendered cookie value */
  hydrate: (type: CustomerTypeValue | null) => void;
}

export const useCustomerTypeStore = create<CustomerTypeStore>()((set) => ({
  customerType: null,
  isEntryModalOpen: false,

  setCustomerType: (type) =>
    set({ customerType: type, isEntryModalOpen: false }),

  openEntryModal: () => set({ isEntryModalOpen: true }),
  closeEntryModal: () => set({ isEntryModalOpen: false }),

  hydrate: (type) =>
    set({ customerType: type, isEntryModalOpen: type === null }),
}));
