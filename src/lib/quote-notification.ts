"use server";

/**
 * Quote notification — Phase 7 follow-up
 *
 * Renders + sends the "your quote is ready" email when the admin marks
 * a Quote SENT. Called from the notifications BullMQ worker, not
 * directly from the admin server action — the same fire-and-forget
 * resilience patterns as the other notification flows.
 */
import { prisma } from "@/lib/prisma";
import { sendQuoteSentEmail } from "@/lib/email-service";

function fmtNOK(d: { toString(): string } | string): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 2,
  }).format(Number(d.toString()));
}

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("nb-NO");
}

export async function sendQuoteNotification(quoteId: string): Promise<void> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { items: true },
  });
  if (!quote) {
    console.warn("[quote-notification] quote not found", quoteId);
    return;
  }

  const recipientName =
    quote.customerName?.trim() ||
    quote.customerEmail.split("@")[0];

  await sendQuoteSentEmail(quote.customerEmail, {
    customerName: recipientName,
    quoteNumber: quote.quoteNumber,
    validUntil: fmtDate(quote.validUntil),
    items: quote.items.map((it) => ({
      name: it.productName,
      sku: it.sku,
      qty: it.quantity,
      unitPrice: fmtNOK(it.unitPriceExclMva),
      lineTotal: fmtNOK(it.lineTotalExclMva),
    })),
    subtotalExclMva: fmtNOK(quote.subtotalExclMva),
    mvaAmount: fmtNOK(quote.mvaAmount),
    totalPrice: fmtNOK(quote.totalPrice),
    notes: quote.notes,
  });
}
