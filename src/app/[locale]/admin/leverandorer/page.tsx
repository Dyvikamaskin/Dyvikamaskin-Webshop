import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";

export const metadata: Metadata = { title: "Leverandører — Admin" };

export default async function SuppliersPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const suppliers = await prisma.supplier.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Leverandører</h1>
        <Link
          href="/admin/leverandorer/ny"
          style={{
            padding: "0.55rem 1.2rem",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          + Ny leverandør
        </Link>
      </header>

      {suppliers.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Ingen leverandører registrert ennå.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
          <thead style={{ background: "#f8fafc", fontSize: "0.8rem", textAlign: "left", color: "#475569" }}>
            <tr>
              <th style={th}>Navn</th>
              <th style={th}>Orgnr</th>
              <th style={th}>Kontakt</th>
              <th style={th}>Produkter</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9", fontSize: "0.875rem", opacity: s.isActive ? 1 : 0.5 }}>
                <td style={td}><strong>{s.name}</strong></td>
                <td style={td}>{s.orgNumber ?? "—"}</td>
                <td style={td}>
                  {s.email ? <div>{s.email}</div> : null}
                  {s.phone ? <div style={{ color: "#64748b" }}>{s.phone}</div> : null}
                </td>
                <td style={td}>{s._count.products}</td>
                <td style={td}>{s.isActive ? "Aktiv" : "Deaktivert"}</td>
                <td style={td}>
                  <Link href={`/admin/leverandorer/${s.id}`} style={{ color: "#0f172a", textDecoration: "underline", fontSize: "0.85rem" }}>
                    Rediger →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.6rem 0.75rem", fontWeight: 700 };
const td: React.CSSProperties = { padding: "0.6rem 0.75rem", verticalAlign: "top" };
