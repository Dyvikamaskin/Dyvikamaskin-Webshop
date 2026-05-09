"use client";

/**
 * TopBarActions — Phase 0.5 client island for the top bar.
 *
 * Renders the interactive trigger buttons inside the otherwise-static
 * server-rendered TopBar:
 *   - Hamburger      → opens the CategoryDrawer
 *   - Scanner icon   → opens the StorefrontScanner modal
 *   - Cart           → links to /handlekurv with a live item-count badge
 *
 * The login/account UI is kept on the server side (in TopBar) because it
 * needs profile data that should not ship to the client.
 */

import Link from "next/link";
import { useDrawerStore } from "@/lib/stores/use-drawer";
import { useScannerStore } from "@/lib/stores/use-scanner";
import { useCartStore } from "@/lib/stores/use-cart";
import {
  HamburgerIcon,
  ScannerIcon,
  CartIcon,
} from "@/components/layout/icons";

export function HamburgerButton() {
  const open = useDrawerStore((s) => s.open);
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Åpne meny"
      className="flex h-10 w-10 items-center justify-center rounded text-slate-800 hover:bg-slate-100"
    >
      <HamburgerIcon className="text-2xl" />
    </button>
  );
}

export function ScannerButton() {
  const open = useScannerStore((s) => s.open);
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Skann produkt"
      title="Skann produkt"
      className="flex h-10 w-10 items-center justify-center rounded text-slate-800 hover:bg-slate-100"
    >
      <ScannerIcon className="text-2xl" />
    </button>
  );
}

export function CartLink() {
  const itemCount = useCartStore((s) => s.itemCount);
  return (
    <Link
      href="/handlekurv"
      aria-label={
        itemCount > 0 ? `Handlekurv (${itemCount})` : "Handlekurv"
      }
      className="relative flex h-10 w-10 items-center justify-center rounded text-slate-800 hover:bg-slate-100"
    >
      <CartIcon className="text-2xl" />
      {itemCount > 0 ? (
        <span
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] font-bold text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </Link>
  );
}
