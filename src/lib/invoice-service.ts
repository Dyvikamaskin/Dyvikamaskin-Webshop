/**
 * Invoice generation service.
 *
 * Called from:
 *   - POST /api/invoices/[saleId]  (admin manual trigger)
 *   - Vipps webhook on CAPTURED    (automatic for B2C paid orders)
 */

import { prisma } from "./prisma";
import { allocateInvoiceNumber } from "./invoice-number";
import { generateKid } from "./kid";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { renderInvoicePdf } from "./invoice-pdf";
import { notifyInvoiceIssued } from "./notification-service";
import { enqueueNotification } from "@/lib/queue/notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateInvoiceResult {
  invoiceNumber: string;
  kidNumber: string;
  invoiceDueDate: Date;
  /** true if this was already generated (idempotent call) */
  alreadyExisted: boolean;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Generate an invoice for the given sale.
 *
 * - Idempotent: returns existing data if the sale already has an invoiceNumber.
 * - Sets `status = INVOICED`, `invoiceNumber`, `kidNumber`, `invoiceDueDate`.
 * - `dueDays` defaults to 0 (immediate/receipt) for B2C, pass 30 for B2B.
 */
export async function generateInvoiceForSale(
  saleId: string,
  dueDays = 0
): Promise<GenerateInvoiceResult> {
  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      status: true,
      invoiceNumber: true,
      kidNumber: true,
      invoiceDueDate: true,
    },
  });

  if (!existing) {
    throw new Error(`Sale ${saleId} not found`);
  }

  if (existing.invoiceNumber && existing.kidNumber && existing.invoiceDueDate) {
    return {
      invoiceNumber: existing.invoiceNumber,
      kidNumber: existing.kidNumber,
      invoiceDueDate: existing.invoiceDueDate,
      alreadyExisted: true,
    };
  }

  // ── Allocate number & generate KID ────────────────────────────────────────
  const invoiceNumber = await allocateInvoiceNumber();
  const kidNumber = generateKid(invoiceNumber);

  const now = new Date();
  const invoiceDueDate = new Date(now);
  invoiceDueDate.setDate(invoiceDueDate.getDate() + dueDays);

  // ── Persist ───────────────────────────────────────────────────────────────
  await prisma.sale.update({
    where: { id: saleId },
    data: {
      status: OrderStatus.INVOICED,
      invoiceNumber,
      kidNumber,
      invoiceDueDate,
    },
  });

  // ── Enqueue invoice notification (PDF render + email). The handler
  //    runs in the BullMQ worker; returns once Redis has the job. ─────────
  await enqueueNotification({
    kind: "invoice-issued",
    saleId,
    invoiceNumber,
    kidNumber,
    invoiceDueDate,
    dueDays,
  });

  return { invoiceNumber, kidNumber, invoiceDueDate, alreadyExisted: false };
}

export async function sendInvoiceNotification(
  saleId: string,
  invoiceNumber: string,
  kidNumber: string,
  invoiceDueDate: Date,
  dueDays: number,
) {
  try {
    // Only send email for B2B (dueDays > 0) or explicitly — B2C gets confirmation email
    if (dueDays === 0) return; // B2C receipt — order confirmed email covers it

    const saleForPdf = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: {
          select: { fullName: true, email: true, invoiceEmail: true, address: true, postalCode: true, city: true, orgNumber: true },
        },
        store:   { select: { name: true, address: true, postalCode: true, city: true, email: true, phone: true } },
        items:   {
          select: {
            sku: true, productName: true, quantity: true,
            unitPriceExclMva: true, mvaRate: true, lineTotalExclMva: true,
          },
        },
      },
    });
    if (!saleForPdf?.customer) return;

    const pdfBuffer = await renderInvoicePdf({
      invoiceNumber,
      kidNumber,
      issuedAt:  new Date(),
      dueDate:   invoiceDueDate,
      customer: {
        fullName:    saleForPdf.customer.fullName,
        address:     saleForPdf.customer.address ?? "",
        postalCode:  saleForPdf.customer.postalCode ?? "",
        city:        saleForPdf.customer.city ?? "",
        email:       saleForPdf.customer.invoiceEmail ?? saleForPdf.customer.email,
        orgNumber:   saleForPdf.customer.orgNumber,
      },
      store: {
        name:       saleForPdf.store.name,
        address:    saleForPdf.store.address,
        postalCode: saleForPdf.store.postalCode,
        city:       saleForPdf.store.city,
        email:      saleForPdf.store.email ?? "",
        phone:      saleForPdf.store.phone ?? "",
      },
      items: saleForPdf.items.map((i) => ({
        sku:              i.sku,
        productName:      i.productName,
        quantity:         i.quantity,
        unitPriceExclMva: i.unitPriceExclMva,
        mvaRate:          i.mvaRate,
        lineTotalExclMva: i.lineTotalExclMva,
      })),
      subtotalExclMva: saleForPdf.subtotalExclMva,
      mvaAmount:       saleForPdf.mvaAmount,
      shippingCost:    0,
      totalPrice:      saleForPdf.totalPrice,
    });

    await notifyInvoiceIssued(saleId, pdfBuffer);
  } catch (err) {
    console.error("[invoice-service] sendInvoiceNotification failed", saleId, err);
  }
}
