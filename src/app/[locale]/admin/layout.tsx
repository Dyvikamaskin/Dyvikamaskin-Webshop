import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: "/admin",                label: "📊 Oversikt" },
  { href: "/admin/ordrer",         label: "📦 Ordrer" },
  { href: "/admin/produkter",      label: "🔧 Produkter" },
  { href: "/admin/batch",          label: "🚀 Batchutsending" },
  { href: "/admin/kunder",         label: "👥 Kunder" },
  { href: "/admin/kampanjer",      label: "🏷️ Kampanjer" },
  { href: "/admin/lager",          label: "🗂️ Lager" },
  { href: "/admin/maskiner",       label: "⚙️ Maskiner" },
  { href: "/admin/stocktake",      label: "🔢 Varetelling" },
  { href: "/admin/produktforslag", label: "🔍 Produktforslag" },
  { href: "/admin/butikk",         label: "🏪 Butikkinnstillinger" },
  // ── Rapporter & eksport ────────────────────────────────────────────────────
  { href: "/admin/regnskap",       label: "📊 Regnskapseksport" },
  { href: "/admin/mva-rapport",    label: "🧾 MVA-rapport" },
  { href: "/admin/revisjonslogg",  label: "🔍 Revisjonslogg" },
  // ── Integrasjoner ──────────────────────────────────────────────────────────
  { href: "/admin/vipps",          label: "💳 Vipps-integrasjon" },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // Guard: only STORE_MANAGER and above may enter the admin area.
  // requireRole redirects to /unauthorized on failure.
  await requireRole(UserRole.STORE_MANAGER);

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <nav
        style={{
          width: "220px",
          background: "#0f172a",
          color: "#e2e8f0",
          padding: "0",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#64748b",
              margin: "0 0 0.2rem",
            }}
          >
            Dyvika Maskin AS
          </p>
          <strong style={{ fontSize: "1.05rem", color: "#f1f5f9" }}>
            Administrasjon
          </strong>
        </div>

        {/* Nav links */}
        <ul style={{ listStyle: "none", padding: "0.75rem 0", margin: 0, flex: 1 }}>
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                style={{
                  display: "block",
                  padding: "0.6rem 1.5rem",
                  color: "#94a3b8",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  transition: "color 0.15s",
                }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #1e293b",
            fontSize: "0.75rem",
            color: "#475569",
          }}
        >
          <Link href="/" style={{ color: "#475569", textDecoration: "none" }}>
            ← Tilbake til butikk
          </Link>
        </div>
      </nav>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          background: "#f8fafc",
          minHeight: "100vh",
          overflow: "auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}
