"use client";

import { useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  useCustomerTypeStore,
  type CustomerTypeValue,
} from "@/lib/stores/use-customer-type";
import { setCustomerTypeAction } from "@/app/actions/customer-type";

interface CustomerTypeToggleProps {
  /**
   * Server-read value of the `customer-type` cookie. Used as the initial
   * render value so the SSR + first client paint agree. After hydration
   * the Zustand store is the source of truth.
   *
   * `null` here means the cookie isn't set yet — the EntryModal will
   * still be open until the user picks a type, so the toggle defaults to
   * CONSUMER for the duration of that flash.
   */
  initialType: CustomerTypeValue | null;
}

/**
 * Persistent Privat | Bedrift segmented control for the TopBar.
 *
 * Visible only to anonymous visitors — the parent decides not to render
 * us when the user is signed in (their audience is locked to
 * Profile.customerType and changes via account settings, not the nav).
 *
 * Clicking flips the `customer-type` cookie via the existing
 * setCustomerTypeAction. For guests this is a pure cookie flip — no org
 * lookup, no modal — and pricing rerenders across the storefront on the
 * next paint because every PDP/listing reads customerType from the same
 * Zustand store.
 *
 * The first-visit EntryModal is unchanged: a brand-new guest still has
 * to pick a type there (and businesses still get the BRREG lookup at
 * signup). This toggle is just the switchback for returning guests.
 */
export function CustomerTypeToggle({ initialType }: CustomerTypeToggleProps) {
  const t = useTranslations("customerType");
  const { customerType, hydrate, setCustomerType } = useCustomerTypeStore();
  const [isPending, startTransition] = useTransition();

  // Co-hydrate with the EntryModal. Both call hydrate() with the same
  // cookie value so this is idempotent. We do it here too so the toggle
  // works even on pages where the modal has already been dismissed.
  useEffect(() => {
    hydrate(initialType);
  }, [initialType, hydrate]);

  // Effective value for rendering: store first, fall back to the SSR
  // prop while the store is still null (pre-hydrate frame, or modal
  // hasn't been dismissed yet).
  const current: CustomerTypeValue = customerType ?? initialType ?? "CONSUMER";

  function handleSelect(type: CustomerTypeValue) {
    if (type === current) return;
    startTransition(async () => {
      await setCustomerTypeAction(type);
      setCustomerType(type);
      // Force the rest of the storefront (server components reading the
      // cookie for the initial price render) to re-render with the new
      // value. Without this, the user would see the new MVA display only
      // after the next navigation.
      window.location.reload();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("toggleLabel")}
      title={t("toggleTooltip")}
      className="hidden items-center rounded-md border border-slate-200 bg-slate-50 p-[2px] md:inline-flex"
    >
      <ToggleButton
        label={t("private")}
        active={current === "CONSUMER"}
        pending={isPending}
        onClick={() => handleSelect("CONSUMER")}
      />
      <ToggleButton
        label={t("business")}
        active={current === "BUSINESS"}
        pending={isPending}
        onClick={() => handleSelect("BUSINESS")}
      />
    </div>
  );
}

function ToggleButton({
  label,
  active,
  pending,
  onClick,
}: {
  label: string;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={pending}
      onClick={onClick}
      className={[
        "rounded px-3 py-1 text-[12px] font-semibold tracking-wide transition-colors",
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-600 hover:text-slate-900",
        pending ? "cursor-wait opacity-60" : "cursor-pointer",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
