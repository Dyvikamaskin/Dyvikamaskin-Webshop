import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

// Routes that require an authenticated session
const PROTECTED_PREFIXES = ["/admin", "/store", "/account", "/konto"];

// Routes only for unauthenticated users (logged-in users are sent to /)
const AUTH_ONLY_PREFIXES = ["/login", "/register", "/registrer"];

const handleI18n = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  // 1. Run next-intl first — it handles locale detection and canonical
  //    redirects. Its response becomes our base response.
  const response = handleI18n(request);

  // 2. Attach a Supabase client that writes refreshed session cookies
  //    directly onto the next-intl response.
  //    Guard: skip if env vars are not yet configured (e.g. during initial
  //    deployment before Supabase credentials are set). Public pages continue
  //    to work; protected routes redirect to /login (user is null).
  let user = null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      });
      // Always use getUser() — never getSession() — to prevent spoofed JWTs.
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      // Supabase unreachable — serve public pages without auth.
    }
  }

  const { pathname } = request.nextUrl;

  // 3. Auth guards
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthOnly && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
