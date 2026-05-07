import Link from "next/link";

/**
 * Unauthorized page — shown when a user lacks the required role.
 */
export default function UnauthorizedPage() {
  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: "480px",
        margin: "4rem auto",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🚫</div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Ingen tilgang
      </h1>
      <p style={{ color: "#64748b", marginBottom: "2rem" }}>
        Du har ikke tillatelse til å se denne siden.
        Kontakt administrator hvis du mener dette er feil.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "0.55rem 1.25rem",
          background: "#0f172a",
          color: "#fff",
          borderRadius: "6px",
          textDecoration: "none",
          fontSize: "0.875rem",
          fontWeight: 600,
        }}
      >
        ← Tilbake til forsiden
      </Link>
    </main>
  );
}
