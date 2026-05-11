"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { enqueueNotification } from "@/lib/queue/notifications";
import {
  QuoteStatus,
  UserRole,
  OrderStatus,
  OrderSource,
  FulfillmentStatus,
  DiscountSource,
} from "@/app/generated/prisma/enums";

const QUOTE_NUMBER_PREFIX = "Q";

// ─── Customer-facing: request a quote ─────────────────────────────────────────

export interface RequestQuoteInput {
  customerEmail: string;
  customerName?: string;
  customerCompany?: string;
  notes?: string;
  storeId: string;
  items: { sku: string; quantity: number }[];
}

export type RequestQuoteResult =
  | { ok: true; quoteNumber: string }
  | { ok: false; error: string };

/**
 * Public "Be om tilbud" — anyone can request a quote (no auth required).
 * Customer associates an existing Profile if logged in; otherwise the
 * quote is anonymous, identified by customerEmail.
 */
export async function requestQuoteAction(
  input: RequestQuoteInput,
): Promise<RequestQuoteResult> {
  if (!input.customerEmail.trim()) {
    return { ok: false, error: "E-post er påkrevd." };
  }
  if (input.items.length === 0) {
    return { ok: false, error: "Velg minst én vare." };
  }

  // Look up products + their current prices for snapshotting.
  const products = await prisma.product.findMany({
    where: { sku: { in: input.items.map((i) => i.sku) }, isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      priceBase: true,
      mvaRate: true,
    },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  let subtotalExclMva = new Prisma.Decimal(0);
  let mvaAmount = new Prisma.Decimal(0);

  const items: {
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPriceExclMva: Prisma.Decimal;
    mvaRate: Prisma.Decimal;
    lineTotalExclMva: Prisma.Decimal;
    lineTotalInclMva: Prisma.Decimal;
  }[] = [];

  for (const it of input.items) {
    const p = productBySku.get(it.sku);
    if (!p) return { ok: false, error: `Produkt ${it.sku} ikke funnet.` };
    if (it.quantity < 1) continue;

    const unit = new Prisma.Decimal(p.priceBase);
    const lineEx = unit.mul(it.quantity);
    const mva = lineEx.mul(p.mvaRate);
    const lineInc = lineEx.plus(mva);

    items.push({
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      quantity: it.quantity,
      unitPriceExclMva: unit,
      mvaRate: new Prisma.Decimal(p.mvaRate),
      lineTotalExclMva: lineEx,
      lineTotalInclMva: lineInc,
    });
    subtotalExclMva = subtotalExclMva.plus(lineEx);
    mvaAmount = mvaAmount.plus(mva);
  }

  const totalPrice = subtotalExclMva.plus(mvaAmount);

  // Resolve customerId if logged in
  let customerId: string | null = null;
  try {
    const user = await requireAuth();
    customerId = user.id;
  } catch {
    // anonymous quote — OK
  }

  // Quote number: Q-YYYY-<random6>
  const year = new Date().getFullYear();
  const quoteNumber = `${QUOTE_NUMBER_PREFIX}-${year}-${randomUUID().slice(0, 6).toUpperCase()}`;

  const created = await prisma.quote.create({
    data: {
      quoteNumber,
      customerId,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      customerName: input.customerName?.trim() || null,
      customerCompany: input.customerCompany?.trim() || null,
      storeId: input.storeId,
      status: QuoteStatus.DRAFT,
      subtotalExclMva,
      mvaAmount,
      totalPrice,
      notes: input.notes?.trim() || null,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      items: { create: items },
    },
    select: { quoteNumber: true },
  });

  revalidatePath("/admin/tilbud");
  return { ok: true, quoteNumber: created.quoteNumber };
}

// ─── Admin: send + accept + reject + convert ─────────────────────────────────

export type QuoteActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendQuoteAction(quoteId: string): Promise<QuoteActionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: QuoteStatus.SENT, sentAt: new Date() },
  });
  await logAudit(admin.id, "QUOTE_SENT", "Quote", quoteId, null, null);

  // Phase 7 follow-up — email the customer that the quote is ready.
  // Goes through the notifications BullMQ queue so a Resend outage
  // doesn't block the admin action. Idempotent at the email layer
  // (Resend dedupes by Idempotency-Key not used here, but multiple
  // sends are operationally harmless — the customer gets a dup).
  await enqueueNotification({ kind: "quote-sent", quoteId });

  revalidatePath("/admin/tilbud");
  return { ok: true };
}

export async function acceptQuoteAction(quoteId: string): Promise<QuoteActionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: QuoteStatus.ACCEPTED, acceptedAt: new Date() },
  });
  await logAudit(admin.id, "QUOTE_ACCEPTED", "Quote", quoteId, null, null);
  revalidatePath("/admin/tilbud");
  return { ok: true };
}

export async function rejectQuoteAction(quoteId: string): Promise<QuoteActionResult> {
  const admin = await requireRole(UserRole.STORE_MANAGER);
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: QuoteStatus.REJECTED, rejectedAt: new Date() },
  });
  await logAudit(admin.id, "QUOTE_REJECTED", "Quote", quoteId, null, null);
  revalidatePath("/admin/tilbud");
  return { ok: true };
}

/**
 * Convert an ACCEPTED quote into a Sale. Mints a new Sale with the
 * quote's line snapshots (price + mvaRate frozen at quote time). The
 * sale starts as PENDING, awaiting payment.
 */
export async function convertQuoteToOrderAction(
  quoteId: string,
): Promise<QuoteActionResult & { saleId?: string }> {
  const admin = await requireRole(UserRole.STORE_MANAGER);

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { items: true },
  });
  if (!quote) return { ok: false, error: "Tilbud ikke funnet." };
  if (quote.status === QuoteStatus.CONVERTED || quote.convertedSaleId) {
    return { ok: false, error: "Tilbudet er allerede konvertert til ordre." };
  }
  if (quote.status !== QuoteStatus.ACCEPTED) {
    return { ok: false, error: "Kun aksepterte tilbud kan konverteres." };
  }

  const saleId = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        checkoutSessionId: `quote:${quote.id}`,
        customerId: quote.customerId,
        createdByAdminId: admin.id,
        storeId: quote.storeId,
        orderSource: OrderSource.PHONE,
        status: OrderStatus.PENDING,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
        subtotalExclMva: quote.subtotalExclMva,
        mvaAmount: quote.mvaAmount,
        totalPrice: quote.totalPrice,
      },
      select: { id: true },
    });
    for (const it of quote.items) {
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: it.productId,
          sku: it.sku,
          productName: it.productName,
          quantity: it.quantity,
          unitPriceExclMva: it.unitPriceExclMva,
          mvaRate: it.mvaRate,
          lineTotalExclMva: it.lineTotalExclMva,
          lineTotalInclMva: it.lineTotalInclMva,
          discountSource: DiscountSource.NONE,
        },
      });
    }
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.CONVERTED, convertedSaleId: sale.id },
    });
    return sale.id;
  });

  await logAudit(admin.id, "QUOTE_CONVERTED", "Quote", quoteId, null, { saleId });
  revalidatePath("/admin/tilbud");
  revalidatePath("/admin/ordrer");
  return { ok: true, saleId };
}
