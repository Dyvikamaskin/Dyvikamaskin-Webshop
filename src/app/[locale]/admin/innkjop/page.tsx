import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";

export const metadata: Metadata = { title: "Innkjøp — Admin" };

export default async function InnkjopPage() {
  await requireRole(UserRole.STORE_MANAGER);

  const lowCount = await prisma.storeStock.count({
    where: {
      product: { isActive: true, isDiscontinued: false },
      quantity: { lte: prisma.storeStock.fields.lowStockThreshold },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "720px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Innkjøp — lav-lager rapport
      </h1>
      <p style={{ color: "#475569", fontSize: "0.9375rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Last ned en CSV med alle produkter på eller under lav-grensen sin,
        gruppert etter foretrukket leverandør. Foreslått bestillingsmengde
        bringer beholdningen opp til 2 × lav-grensen.
      </p>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.25rem 1.5rem",
        }}
      >
        <p style={{ margin: "0 0 1rem", fontSize: "0.9375rem" }}>
          Aktuelle lav-lager-poster: <strong>{lowCount}</strong>
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
            /api/exports/low-stock is an API route returning a CSV file.
            <Link> would intercept it for client-side navigation; we want
            a hard browser nav so the browser triggers the file download. */}
        <a
          href="/api/exports/low-stock"
          style={{
            display: "inline-block",
            padding: "0.55rem 1.2rem",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          Last ned CSV
        </a>
      </div>
    </div>
  );
}
