import Link from "next/link";
import {
  UserIcon,
  StoreIcon,
  PhoneIcon,
  MegaphoneIcon,
} from "@/components/layout/icons";

/**
 * InfoCardsRow — Phase 0.5
 *
 * Optional row of four icon + caption + sub-link cards. Reference:
 * tools.no. Renders only when explicitly mounted (typically the home
 * page) — not part of the global StoreHeader so it does not clutter
 * deep pages.
 */
const CARDS = [
  {
    icon: UserIcon,
    title: "BLI KUNDE",
    sub: "Kom i gang",
    href: "/registrer",
  },
  {
    icon: StoreIcon,
    title: "VÅRE LAGRE",
    sub: "Finn lager",
    href: "/info/finn-lager",
  },
  {
    icon: PhoneIcon,
    title: "KONTAKT OSS",
    sub: "Vi hjelper deg",
    href: "/info/kontakt",
  },
  {
    icon: MegaphoneIcon,
    title: "BE OM TILBUD",
    sub: "For store ordre",
    href: "/info/tilbud",
  },
];

export function InfoCardsRow() {
  return (
    <section
      aria-label="Snarveier"
      className="border-b border-slate-200 bg-slate-50"
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-slate-200 px-3 py-4 sm:grid-cols-4 sm:divide-x sm:px-6">
        {CARDS.map(({ icon: Icon, title, sub, href }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 px-3 py-2 text-slate-900 hover:text-blue-700"
          >
            <Icon className="text-3xl text-slate-700 group-hover:text-blue-700" />
            <div className="flex flex-col">
              <span className="text-[13px] font-bold tracking-wide">
                {title}
              </span>
              <span className="text-xs text-slate-600">→ {sub}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
