import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/app/actions/auth";

/**
 * StoreHeader — server component.
 * Reads auth state and renders the top navigation bar for all storefront pages.
 */
export default async function StoreHeader() {
  const cookieStore = await cookies();

  let userName: string | null = null;
  let userRole: string | null = null;

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      });
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const profile = await prisma.profile.findUnique({
          where:  { id: user.id },
          select: { fullName: true, role: true },
        });
        userName = profile?.fullName ?? user.email ?? null;
        userRole = profile?.role ?? null;
      }
    } catch {
      // Auth unavailable — show public view
    }
  }

  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "STORE_MANAGER";

  return (
    <header
      style={{
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 1.5rem",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        {/* Brand */}
        <a
          href="/"
          style={{
            fontWeight: 800,
            fontSize: "1.05rem",
            color: "#0f172a",
            textDecoration: "none",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          Dyvikamaskin
        </a>

        {/* Nav links */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            fontSize: "0.875rem",
          }}
        >
          {userName ? (
            <>
              {/* Logged-in state */}
              <span
                style={{
                  color: "#64748b",
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.825rem",
                }}
              >
                {userName}
              </span>

              {isAdmin && (
                <a
                  href="/admin"
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "5px",
                    color: "#0f172a",
                    fontWeight: 600,
                    textDecoration: "none",
                    background: "#f1f5f9",
                    fontSize: "0.825rem",
                  }}
                >
                  Admin
                </a>
              )}

              <a
                href="/konto"
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "5px",
                  color: "#0f172a",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Min konto
              </a>

              <form action={logoutAction} style={{ display: "inline" }}>
                <button
                  type="submit"
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "5px",
                    color: "#64748b",
                    fontWeight: 500,
                    fontSize: "0.825rem",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Logg ut
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Logged-out state */}
              <a
                href="/registrer"
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "5px",
                  color: "#0f172a",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Registrer deg
              </a>

              <a
                href="/login"
                style={{
                  padding: "0.4rem 0.9rem",
                  borderRadius: "5px",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 600,
                  textDecoration: "none",
                  fontSize: "0.875rem",
                }}
              >
                Logg inn
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
