import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Login page — Supabase Magic Link / email+password sign-in.
 * Accessible at /login (locale-agnostic via proxy middleware).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If already logged in, redirect to intended destination or home
  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(next ?? "/");
  }

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: "420px",
        margin: "4rem auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Logg inn
      </h1>
      <p style={{ color: "#64748b", marginBottom: "2rem", fontSize: "0.9rem" }}>
        Bruk e-post og passord eller Magic Link for å logge inn.
      </p>

      {/* Supabase Auth UI will be embedded here in a later phase.
          For now, link directly to Supabase hosted UI or use email magic link. */}
      <div
        style={{
          padding: "1.25rem",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          fontSize: "0.875rem",
          color: "#475569",
        }}
      >
        <p style={{ margin: 0 }}>
          Logg inn via Supabase-dashbordet for å få tilgang til admin-panelet,
          eller kontakt administrator.
        </p>
        {next && (
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
            Du vil bli sendt til: <code>{next}</code>
          </p>
        )}
      </div>
    </main>
  );
}
