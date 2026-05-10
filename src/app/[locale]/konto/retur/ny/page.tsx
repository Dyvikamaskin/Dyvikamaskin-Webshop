import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewReturnForm } from "@/components/account/NewReturnForm";

export const metadata: Metadata = { title: "Opprett retur — Dyvikamaskin" };

interface Props {
  searchParams: Promise<{ saleId?: string }>;
}

export default async function NewReturnPage({ searchParams }: Props) {
  const user = await requireAuth();
  const { saleId } = await searchParams;
  if (!saleId) redirect("/konto/retur");

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      status: true,
      items: {
        select: {
          id: true,
          sku: true,
          productName: true,
          quantity: true,
          unitPriceExclMva: true,
        },
      },
    },
  });
  if (!sale) notFound();
  if (sale.customerId !== user.id) redirect("/konto/retur");

  return (
    <main style={{ maxWidth: "720px", padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Opprett returforespørsel
      </h1>
      <p style={{ color: "#475569", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
        Ordre {sale.invoiceNumber ?? sale.id.slice(0, 8)}. Velg hvilke varer
        du ønsker å returnere og oppgi årsak.
      </p>
      <NewReturnForm
        saleId={sale.id}
        items={sale.items.map((i) => ({
          saleItemId: i.id,
          sku: i.sku,
          productName: i.productName,
          maxQuantity: i.quantity,
        }))}
      />
    </main>
  );
}
