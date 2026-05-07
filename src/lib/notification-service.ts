"use server";

/**
 * Notification service — orchestrates email + SMS for every trigger event.
 *
 * All public functions are fire-and-forget safe: they should be called with
 * `void` (no await) from the main operation flow so a notification failure
 * never aborts a business transaction.
 *
 * Trigger surfaces:
 *   notifyOrderConfirmed    ← phone-order.ts, checkout.ts (via Vipps AUTHORIZED)
 *   notifyPaymentReceived   ← vipps webhook CAPTURED
 *   notifyInvoiceIssued     ← invoice-service.ts
 *   notifyShipped           ← admin.ts (fulfillment status → SHIPPED)
 *   notifyReadyForPickup    ← admin.ts (fulfillment status → READY_FOR_PICKUP)
 *   checkAndNotifyLowStock  ← vipps webhook (after stock deduction), stocktake finalise
 */

import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms-service";
import {
  sendOrderConfirmedEmail,
  sendInvoiceIssuedEmail,
  sendShippedEmail,
  sendReadyForPickupEmail,
  sendLowStockAlertEmail,
} from "@/lib/email-service";
import {
  NotificationChannel,
  NotificationType,
} from "@/app/generated/prisma/enums";

// ─── Helper: log to Notification table ───────────────────────────────────────

async function logNotification(
  profileId:  string,
  saleId:     string | null,
  channel:    NotificationChannel,
  type:       NotificationType,
  payload:    object,
  delivered:  boolean
) {
  try {
    await prisma.notification.create({
      data: {
        profileId,
        saleId,
        channel,
        type,
        deliveredAt: delivered ? new Date() : null,
        payload,
      },
    });
  } catch (err) {
    console.error("[notifications] logNotification failed", err);
  }
}

// ─── Helper: format currency ──────────────────────────────────────────────────

function fmtNOK(val: { toNumber?: () => number } | number | string): string {
  const n = typeof val === "object" && val && typeof (val as { toNumber?: unknown }).toNumber === "function"
    ? (val as { toNumber: () => number }).toNumber()
    : Number(val);
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(n);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("nb-NO");
}

// ─── Trigger: ORDER_CONFIRMED ─────────────────────────────────────────────────

export async function notifyOrderConfirmed(saleId: string): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true },
        },
        store: {
          select: { name: true },
        },
        items: {
          select: {
            sku: true, productName: true, quantity: true,
            unitPriceExclMva: true, mvaRate: true,
            lineTotalExclMva: true, lineTotalInclMva: true,
          },
        },
      },
    });

    if (!sale?.customer) return;

    const result = await sendOrderConfirmedEmail(sale.customer.email, {
      customerName:  sale.customer.fullName,
      orderId:       sale.id.slice(0, 8),
      storeName:     sale.store.name,
      isPickup:      sale.isPickup,
      items: sale.items.map((i) => ({
        name:      i.productName,
        sku:       i.sku,
        qty:       i.quantity,
        lineTotal: fmtNOK(i.lineTotalInclMva),
      })),
      subtotalExcl:  fmtNOK(sale.subtotalExclMva),
      mvaAmount:     fmtNOK(sale.mvaAmount),
      totalIncl:     fmtNOK(sale.totalPrice),
      invoiceNumber: sale.invoiceNumber,
    });

    await logNotification(
      sale.customer.id, saleId,
      NotificationChannel.EMAIL, NotificationType.ORDER_CONFIRMED,
      { emailId: result.id, to: sale.customer.email },
      result.ok
    );
  } catch (err) {
    console.error("[notifications] notifyOrderConfirmed failed", saleId, err);
  }
}

// ─── Trigger: INVOICE_ISSUED ──────────────────────────────────────────────────

export async function notifyInvoiceIssued(
  saleId: string,
  pdfBuffer: Buffer
): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: {
          select: {
            id: true, fullName: true,
            email: true, invoiceEmail: true,
          },
        },
      },
    });

    if (!sale?.customer || !sale.invoiceNumber) return;

    const recipientEmail = sale.customer.invoiceEmail ?? sale.customer.email;
    const dueDate = sale.invoiceDueDate
      ? sale.invoiceDueDate.toLocaleDateString("nb-NO")
      : "—";

    const result = await sendInvoiceIssuedEmail(
      recipientEmail,
      {
        customerName:  sale.customer.fullName,
        invoiceNumber: sale.invoiceNumber,
        orderId:       sale.id.slice(0, 8),
        totalIncl:     fmtNOK(sale.totalPrice),
        dueDate,
        kidNumber:     sale.kidNumber,
        accountNumber: process.env.COMPANY_BANK_ACCOUNT ?? "—",
      },
      pdfBuffer,
      `faktura-${sale.invoiceNumber}.pdf`
    );

    await logNotification(
      sale.customer.id, saleId,
      NotificationChannel.EMAIL, NotificationType.INVOICE_ISSUED,
      { emailId: result.id, to: recipientEmail },
      result.ok
    );
  } catch (err) {
    console.error("[notifications] notifyInvoiceIssued failed", saleId, err);
  }
}

// ─── Trigger: SHIPPED ─────────────────────────────────────────────────────────

export async function notifyShipped(saleId: string): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
        store:   { select: { name: true } },
        items:   { select: { productName: true, quantity: true } },
      },
    });

    if (!sale?.customer) return;

    const emailResult = await sendShippedEmail(sale.customer.email, {
      customerName:   sale.customer.fullName,
      orderId:        sale.id.slice(0, 8),
      storeName:      sale.store.name,
      trackingNumber: sale.trackingNumber,
      trackingUrl:    sale.trackingNumber
        ? `https://sporing.bring.no/sporing/${sale.trackingNumber}`
        : null,
      items: sale.items.map((i) => ({ name: i.productName, qty: i.quantity })),
    });

    await logNotification(
      sale.customer.id, saleId,
      NotificationChannel.EMAIL, NotificationType.SHIPPED,
      { emailId: emailResult.id }, emailResult.ok
    );

    // SMS if phone number exists
    if (sale.customer.phoneNumber) {
      const trackPart = sale.trackingNumber
        ? ` Sporingsnr: ${sale.trackingNumber}`
        : "";
      const smsResult = await sendSms(
        sale.customer.phoneNumber,
        `Dyvika Maskin: Ordren din er sendt!${trackPart}`
      );
      await logNotification(
        sale.customer.id, saleId,
        NotificationChannel.SMS, NotificationType.SHIPPED,
        { provider: smsResult.provider }, smsResult.ok
      );
    }
  } catch (err) {
    console.error("[notifications] notifyShipped failed", saleId, err);
  }
}

// ─── Trigger: READY_FOR_PICKUP ────────────────────────────────────────────────

export async function notifyReadyForPickup(saleId: string): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
        store:   { select: { name: true, address: true, postalCode: true, city: true, phone: true } },
        items:   { select: { productName: true, quantity: true } },
      },
    });

    if (!sale?.customer) return;

    const storeAddress = `${sale.store.address}, ${sale.store.postalCode} ${sale.store.city}`;

    const emailResult = await sendReadyForPickupEmail(sale.customer.email, {
      customerName: sale.customer.fullName,
      orderId:      sale.id.slice(0, 8),
      storeName:    sale.store.name,
      storeAddress,
      storePhone:   sale.store.phone,
      items: sale.items.map((i) => ({ name: i.productName, qty: i.quantity })),
    });

    await logNotification(
      sale.customer.id, saleId,
      NotificationChannel.EMAIL, NotificationType.READY_FOR_PICKUP,
      { emailId: emailResult.id }, emailResult.ok
    );

    // SMS always for pickup
    if (sale.customer.phoneNumber) {
      const smsResult = await sendSms(
        sale.customer.phoneNumber,
        `Dyvika Maskin: Ordren din (${sale.id.slice(0, 8)}) er klar for henting hos ${sale.store.name}. Adresse: ${storeAddress}`
      );
      await logNotification(
        sale.customer.id, saleId,
        NotificationChannel.SMS, NotificationType.READY_FOR_PICKUP,
        { provider: smsResult.provider }, smsResult.ok
      );
    }
  } catch (err) {
    console.error("[notifications] notifyReadyForPickup failed", saleId, err);
  }
}

// ─── Trigger: LOW_STOCK check ─────────────────────────────────────────────────

/**
 * Called after stock is decremented (Vipps webhook, stocktake finalise).
 * Checks all products in the given store that may have dropped below threshold
 * and sends a single consolidated alert email to the store manager(s).
 *
 * Deduplicates: won't send if an identical alert was sent in the last hour.
 */
export async function checkAndNotifyLowStock(
  storeId: string,
  productIds?: string[]  // optional: only check these products
): Promise<void> {
  try {
    const lowStockItems = await prisma.storeStock.findMany({
      where: {
        storeId,
        ...(productIds?.length ? { productId: { in: productIds } } : {}),
        product: { isActive: true },
        quantity: { lte: prisma.storeStock.fields.lowStockThreshold },
      },
      select: {
        quantity:         true,
        lowStockThreshold: true,
        locationCode:     true,
        product: { select: { sku: true, name: true } },
      },
    });

    if (lowStockItems.length === 0) return;

    // Find store manager(s) for this store
    const managers = await prisma.storeStaff.findMany({
      where: { storeId, role: "STORE_MANAGER" },
      select: {
        profile: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (managers.length === 0) return;

    const store = await prisma.store.findUnique({
      where:  { id: storeId },
      select: { name: true },
    });
    if (!store) return;

    // Deduplication: check if a LOW_STOCK alert was sent in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAlert = await prisma.notification.findFirst({
      where: {
        profileId:   managers[0].profile.id,
        type:        NotificationType.LOW_STOCK,
        sentAt:      { gte: oneHourAgo },
      },
    });
    if (recentAlert) return; // already notified recently

    for (const mgr of managers) {
      const result = await sendLowStockAlertEmail(mgr.profile.email, {
        managerName: mgr.profile.fullName,
        storeName:   store.name,
        items: lowStockItems.map((i) => ({
          sku:          i.product.sku,
          productName:  i.product.name,
          currentQty:   i.quantity,
          threshold:    i.lowStockThreshold,
          locationCode: i.locationCode,
        })),
      });

      await logNotification(
        mgr.profile.id, null,
        NotificationChannel.EMAIL, NotificationType.LOW_STOCK,
        { emailId: result.id, to: mgr.profile.email, itemCount: lowStockItems.length },
        result.ok
      );
    }
  } catch (err) {
    console.error("[notifications] checkAndNotifyLowStock failed", storeId, err);
  }
}
