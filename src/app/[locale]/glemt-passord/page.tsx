import ForgotPasswordForm from "./_ForgotPasswordForm";

export const metadata = { title: "Glemt passord — Dyvikamaskin" };

export default function GlemtPassordPage() {
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
            Glemt passord
          </h1>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  );
}
