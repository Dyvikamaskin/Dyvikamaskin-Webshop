import Image from "next/image";
import Link from "next/link";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { SearchBar } from "@/components/layout/SearchBar";
import { CustomerTypeToggle } from "@/components/layout/CustomerTypeToggle";
import {
  HamburgerButton,
  ScannerButton,
  CartLink,
} from "@/components/layout/TopBarActions";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

/**
 * TopBar — Phase 0.5
 *
 * The top row of the storefront chrome (reference: tools.no).
 * Layout left to right:
 *   Hamburger | Logo | Search | Scanner | Account | Cart
 *
 * Server component. Auth state is read via Supabase SSR + Prisma so the
 * Min konto + Admin links can render correctly without client JS. The
 * three interactive buttons (hamburger, scanner, cart) are imported from
 * TopBarActions, which is the lone client island.
 */
export default async function TopBar() {
  const cookieStore = await cookies();

  let userName: string | null = null;
  let userRole: string | null = null;
  let isAuthenticated = false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      });
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        isAuthenticated = true;
        const profile = await prisma.profile.findUnique({
          where: { id: user.id },
          select: { fullName: true, role: true },
        });
        userName = profile?.fullName?.trim() || user.email || null;
        userRole = profile?.role ?? null;
      }
    } catch {
      // Auth unavailable — fall through to guest view.
    }
  }

  // Customer-type toggle: only rendered for anonymous visitors. Logged-in
  // users have a locked audience on their Profile and change it via
  // account settings, not the nav.
  const rawType = cookieStore.get("customer-type")?.value;
  const initialCustomerType: CustomerTypeValue | null =
    rawType === "CONSUMER" || rawType === "BUSINESS" ? rawType : null;

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <HamburgerButton />

        <Link
          href="/"
          className="shrink-0"
          aria-label="Dyvikamaskin — gå til forsiden"
        >
          <Image
            src="/brand/dyvika-logo-red.png"
            alt="Dyvikamaskin"
            width={118}
            height={36}
            loading="eager"
            fetchPriority="high"
          />
        </Link>

        <div className="hidden flex-1 px-2 md:flex">
          <SearchBar />
        </div>

        <ScannerButton />

        {!isAuthenticated && (
          <CustomerTypeToggle initialType={initialCustomerType} />
        )}

        <AccountMenu userName={userName} userRole={userRole} />

        <CartLink />
      </div>

      {/* Mobile search row — full-width below the bar on small screens */}
      <div className="border-t border-slate-100 px-3 py-2 md:hidden">
        <SearchBar />
      </div>
    </div>
  );
}
