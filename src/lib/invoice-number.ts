import { prisma } from "./prisma";

/**
 * Allocate the next invoice number for the current calendar year.
 *
 * Format: "YYYY-NNNNNN"  (e.g. "2026-000001")
 *
 * The upsert is atomic in PostgreSQL — concurrent calls cannot receive
 * the same sequence number.
 */
export async function allocateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const { lastSeq } = await prisma.invoiceCounter.upsert({
    where: { year },
    create: { year, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  return `${year}-${String(lastSeq).padStart(6, "0")}`;
}
