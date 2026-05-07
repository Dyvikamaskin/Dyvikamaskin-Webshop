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

  return { invoiceNumber, kidNumber, invoiceDueDate, alreadyExisted: false };
}
