import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import RegisterForm from "./_RegisterForm";

export const metadata = { title: "Registrer deg — Dyvikamaskin" };

export default async function RegisterPage() {
  const cookieStore     = await cookies();
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Already logged in → send home
  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        padding: "2rem 1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "2rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0 0 0.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Dyvikamaskin
          </p>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Opprett konto
          </h1>
        </div>

        <RegisterForm />
      </div>
    </main>
  );
}
