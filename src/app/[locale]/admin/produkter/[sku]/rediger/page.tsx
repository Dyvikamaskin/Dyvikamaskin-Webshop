import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import FitmentSection from "./_FitmentSection";

interface PageProps {
  params: Promise<{ sku: string }>;
}

export default async function RedigerProduktPage({ params }: PageProps) {
  const { sku } = await params;

  const product = await prisma.product.findUnique({
    where: { sku },
    include: {
      category: true,
      fitments: {
        include: { model: { include: { make: true } } },
      },
    },
  });

  if (!product) notFound();

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 0.25rem" }}>
          Produkter / {product.sku}
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          {product.name}
        </h1>
      </div>

      {/* ── Basic info card ──────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0 0 1rem",
          }}
        >
          Grunninfo
        </h2>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            rowGap: "0.5rem",
            columnGap: "1rem",
            fontSize: "0.875rem",
            margin: 0,
          }}
        >
          <InfoRow label="SKU"          value={product.sku} mono />
          <InfoRow label="Navn"         value={product.name} />
          <InfoRow label="Merke"        value={product.brand} />
          <InfoRow label="Delenummer"   value={product.partNumber} mono />
          <InfoRow
            label="Pris (ekskl. MVA)"
            value={
              product.priceBase != null
                ? `kr ${Number(product.priceBase).toLocaleString("nb-NO", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : undefined
            }
          />
          <InfoRow label="Kategori"     value={product.category?.name} />
          <InfoRow label="Aktiv"        value={product.isActive ? "Ja" : "Nei"} />
        </dl>

        <p
          style={{
            marginTop: "1rem",
            marginBottom: 0,
            fontSize: "0.8rem",
            color: "#94a3b8",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "5px",
            padding: "0.5rem 0.75rem",
          }}
        >
          Bruk lager-siden for å redigere priser og lagerbeholdning.
        </p>
      </div>

      {/* ── Fitment section ──────────────────────────────────────────── */}
      <FitmentSection
        productId={product.id}
        sku={product.sku}
        partNumber={product.partNumber}
        ean={product.barcodes[0] ?? null}
        brand={product.brand}
        productName={product.name}
        initialFitments={product.fitments}
      />
    </div>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <>
      <dt style={{ color: "#64748b", fontWeight: 500 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: value ? "#0f172a" : "#cbd5e1",
          fontFamily: mono ? "monospace" : undefined,
          fontSize: mono ? "0.8rem" : undefined,
        }}
      >
        {value ?? "—"}
      </dd>
    </>
  );
}
