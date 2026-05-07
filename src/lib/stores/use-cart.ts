"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  mainImage: string | null;
  categoryId: string | null;
  minimumOrderQuantity: number;
  quantity: number;
  /** Unit price ex. MVA — snapshot at time of add / last server validation */
  priceEx: number;
  /** Unit price inc. MVA */
  priceInc: number;
  mvaRate: number;
  discountPct: number;
  discountSource: string;
  promotionId?: string;
}

interface CartStore {
  items: CartItem[];

  /** Add an item or increment quantity if SKU already present */
  addItem: (item: CartItem) => void;
  /** Remove a SKU entirely */
  removeItem: (sku: string) => void;
  /** Update quantity for a SKU — removes item if quantity <= 0 */
  updateQuantity: (sku: string, quantity: number) => void;
  /** Replace price snapshots after a server-side validation */
  applyPricingUpdate: (updates: Pick<CartItem, "sku" | "priceEx" | "priceInc" | "mvaRate" | "discountPct" | "discountSource" | "promotionId">[]) => void;
  /** Empty the entire cart */
  clearCart: () => void;

  // ── Derived (computed inline for Zustand 5 compatibility) ──────────────────
  readonly itemCount: number;
  readonly lineCount: number;
  readonly isEmpty: boolean;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      get itemCount() {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },
      get lineCount() {
        return get().items.length;
      },
      get isEmpty() {
        return get().items.length === 0;
      },

      addItem(item) {
        set((state) => {
          const existing = state.items.find((i) => i.sku === item.sku);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.sku === item.sku
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },

      removeItem(sku) {
        set((state) => ({
          items: state.items.filter((i) => i.sku !== sku),
        }));
      },

      updateQuantity(sku, quantity) {
        if (quantity <= 0) {
          get().removeItem(sku);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.sku === sku ? { ...i, quantity } : i
          ),
        }));
      },

      applyPricingUpdate(updates) {
        const map = new Map(updates.map((u) => [u.sku, u]));
        set((state) => ({
          items: state.items.map((item) => {
            const update = map.get(item.sku);
            return update ? { ...item, ...update } : item;
          }),
        }));
      },

      clearCart() {
        set({ items: [] });
      },
    }),
    {
      name: "industriparts-cart",
      // Only persist items — derived getters re-attach on rehydration
      partialize: (state) => ({ items: state.items }),
    }
  )
);
