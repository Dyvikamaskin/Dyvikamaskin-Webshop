import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { UserIcon, ChevronDownIcon } from "@/components/layout/icons";

interface AccountMenuProps {
  /** Logged-in display name, or null for guest. */
  userName: string | null;
  /** Profile.role, or null for customer / guest. */
  userRole: string | null;
}

/**
 * AccountMenu — Phase 0.5
 *
 * Top-bar account block. Renders:
 *   - Guest: a single "Logg inn" button.
 *   - Authenticated: name + dropdown with Min konto, Admin (if staff),
 *     and a Logg ut form button (POSTs the logoutAction).
 *
 * The dropdown uses CSS-only hover state for the desktop case and a
 * native <details> on mobile so we keep this a server component
 * (no client JS for the menu open/close).
 */
export function AccountMenu({ userName, userRole }: AccountMenuProps) {
  const isAdmin =
    userRole === "SUPER_ADMIN" || userRole === "STORE_MANAGER";

  if (!userName) {
    return (
      <Link
        href="/login"
        className="flex h-10 items-center gap-2 rounded px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
      >
        <UserIcon className="text-xl" />
        <span className="hidden sm:inline">Logg inn</span>
      </Link>
    );
  }

  return (
    <details className="group relative">
      <summary
        className="flex h-10 list-none items-center gap-2 rounded px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 [&::-webkit-details-marker]:hidden"
        aria-label="Kontomeny"
      >
        <UserIcon className="text-xl" />
        <span className="hidden sm:inline max-w-[8rem] truncate">{userName}</span>
        <ChevronDownIcon className="text-sm text-slate-500 transition group-open:rotate-180" />
      </summary>

      <div
        className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      >
        <Link
          href="/konto"
          className="block px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
        >
          Min konto
        </Link>
        <Link
          href="/konto/mine-maskiner"
          className="block px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
        >
          Mine maskiner
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className="block px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            Admin
          </Link>
        ) : null}
        <hr className="my-1 border-slate-200" />
        <form action={logoutAction}>
          <button
            type="submit"
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Logg ut
          </button>
        </form>
      </div>
    </details>
  );
}
