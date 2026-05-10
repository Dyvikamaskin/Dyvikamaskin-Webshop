import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { RequestQuoteForm } from "@/components/storefront/RequestQuoteForm";

export const metadata: Metadata = { title: "Be om tilbud — Dyvikamaskin" };

interface Props {
  searchParams: Promise<{ sku?: string; quantity?: string }>;
}

export default async function RequestQuotePage({ searchParams }: Props) {
  const { sku, quantity } = await searchParams;

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // If a SKU is passed via querystring (e.g. from a PDP), pre-load that
  // product so the form starts populated.
  const product = sku
    ? await prisma.product.findUnique({
        where: { sku, isActive: true },
        select: { sku: true, name: true, brand: true },
      })
    : null;

  return (
    <main style={{ maxWidth: "720px", margin: "0 auto", padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
        Be om tilbud
      </h1>
      <p style={{ color: "#475569", marginBottom: "1.5rem", fontSize: "0.95rem", lineHeight: 1.5 }}>
        For større volumkjøp eller bedriftskunder — fyll inn skjemaet og vi
        kommer tilbake til deg med pris og leveringstid.
      </p>

      <RequestQuoteForm
        stores={stores}
        defaultSku={product?.sku ?? ""}
        defaultProductLabel={product ? `${product.name}${product.brand ? ` (${product.brand})` : ""}` : ""}
        defaultQuantity={quantity ? parseInt(quantity, 10) || 1 : 1}
      />
    </main>
  );
}
