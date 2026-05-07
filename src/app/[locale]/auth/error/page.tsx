export const metadata = { title: "Autentiseringsfeil — Dyvikamaskin" };

export default function AuthErrorPage() {
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
          border: "1px solid #fecaca",
          borderRadius: "12px",
          padding: "2rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>⚠️</div>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem" }}>
          Autentisering feilet
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1.5rem" }}>
          Lenken kan ha utløpt eller allerede blitt brukt. Be om en ny lenke og prøv igjen.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/login"
            style={{
              padding: "0.5rem 1.25rem",
              background: "#0f172a",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Logg inn
          </a>
          <a
            href="/glemt-passord"
            style={{
              padding: "0.5rem 1.25rem",
              background: "#fff",
              color: "#0f172a",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Glemt passord
          </a>
        </div>
      </div>
    </main>
  );
}
