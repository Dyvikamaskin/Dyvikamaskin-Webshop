import Link from "next/link";

/**
 * PrimaryNav — Phase 0.5
 *
 * The horizontal nav row below the TopBar. Reference: tools.no.
 * Hidden below md so the hamburger drawer is the small-screen
 * navigation surface.
 *
 * Items are static and editable here — Phase 0.6 (dynamic categories)
 * will replace MASKINER and PRODUKTER with real data; this component
 * keeps the labels stable across phases.
 *
 * Note: the VELG LAGER button was removed (locked decision, v4.2) —
 * we have one store, so the lager-picker affordance had nowhere to go.
 */
const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "PRODUKTER",     href: "/produkter" },
  { label: "MASKINER",      href: "/maskiner" },
  { label: "KAMPANJER",     href: "/kampanjer" },
  { label: "VAREMERKER",    href: "/varemerker" },
  { label: "OUTLET",        href: "/outlet" },
  { label: "KUNDESERVICE",  href: "/info/kundeservice" },
];

export function PrimaryNav() {
  return (
    <div className="hidden border-b border-slate-200 bg-white md:block">
      <div className="mx-auto flex max-w-[1280px] items-center px-6">
        <nav>
          <ul className="flex items-center">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-4 py-3 text-[13px] font-bold tracking-wide text-slate-900 hover:text-blue-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
