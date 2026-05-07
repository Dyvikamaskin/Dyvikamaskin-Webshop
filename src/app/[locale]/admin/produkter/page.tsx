import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function ProdukterPage() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      category: true,
      _count: { select: { fitments: true } },
    },
  });

  return (
    <div style={{ padding: "2rem" }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Produkter
        </h1>
        <span
          style={{
            fontSize: "0.8rem",
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: "999px",
            padding: "0.2rem 0.65rem",
            color: "#64748b",
            fontWeight: 500,
          }}
        >
          {products.length} produkter
        </span>

        {/* ── Action buttons ──────────────────────────────────────── */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
          <Link
            href="/admin/produkter/importer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.45rem 0.9rem",
              background: "#f8fafc",
              color: "#374151",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            📥 Importer CSV
          </Link>
          <Link
            href="/admin/produkter/ny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.45rem 0.9rem",
              background: "#0f172a",
              color: "#fff",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            ➕ Nytt produkt
          </Link>
        </div>
      </div>

      {/* ── Table card ────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {products.length === 0 ? (
          <p
            style={{
              padding: "2rem",
              color: "#94a3b8",
              fontSize: "0.9rem",
              margin: 0,
              textAlign: "center",
            }}
          >
            Ingen produkter ennå.{" "}
            <Link href="/admin/produkter/ny" style={{ color: "#2563eb" }}>
              Legg til ett produkt
            </Link>{" "}
            eller{" "}
            <Link href="/admin/produkter/importer" style={{ color: "#2563eb" }}>
              importer fra CSV
            </Link>
            .
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["SKU", "Navn", "Merke", "Pris", "Aktiv", "Tilpasninger", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr
                  key={p.sku}
                  style={{
                    borderBottom: i < products.length - 1 ? "1px solid #f1f5f9" : "none",
                  }}
                >
                  {/* SKU */}
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      color: "#475569",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.sku}
                  </td>

                  {/* Navn */}
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      color: "#0f172a",
                      fontWeight: 500,
                    }}
                  >
                    {p.name}
                    {p.category && (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.75rem",
                          color: "#94a3b8",
                          fontWeight: 400,
                        }}
                      >
                        {p.category.name}
                      </span>
                    )}
                  </td>

                  {/* Merke */}
                  <td style={{ padding: "0.75rem 1rem", color: "#475569" }}>
                    {p.brand ?? <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>

                  {/* Pris */}
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.priceBase != null
                      ? `kr ${Number(p.priceBase).toLocaleString("nb-NO", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>

                  {/* Aktiv */}
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontSize: "1rem",
                      color: p.isActive ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {p.isActive ? "✓" : "✗"}
                  </td>

                  {/* Tilpasninger */}
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "1.5rem",
                        padding: "0.1rem 0.4rem",
                        background: p._count.fitments > 0 ? "#eff6ff" : "#f1f5f9",
                        color: p._count.fitments > 0 ? "#1d4ed8" : "#94a3b8",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      {p._count.fitments}
                    </span>
                  </td>

                  {/* Rediger */}
                  <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                    <Link
                      href={`/admin/produkter/${encodeURIComponent(p.sku)}/rediger`}
                      style={{
                        fontSize: "0.8rem",
                        color: "#2563eb",
                        textDecoration: "none",
                        fontWeight: 500,
                        padding: "0.3rem 0.7rem",
                        border: "1px solid #bfdbfe",
                        borderRadius: "5px",
                        background: "#eff6ff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Rediger
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
