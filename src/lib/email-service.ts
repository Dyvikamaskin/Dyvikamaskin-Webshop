/**
 * Email service — thin wrapper around Resend.
 *
 * Provides typed send functions for each notification type.
 * All functions are fire-and-forget safe: they never throw;
 * errors are logged and the result is returned.
 *
 * Resend free tier: 3,000 emails/month.
 * RESEND_API_KEY env var must be set in production.
 */

import { Resend } from "resend";
import { render } from "@react-email/components";

import OrderConfirmedEmail,  { type OrderConfirmedEmailProps }  from "@/emails/OrderConfirmedEmail";
import ShippedEmail,         { type ShippedEmailProps }         from "@/emails/ShippedEmail";
import ReadyForPickupEmail,  { type ReadyForPickupEmailProps }  from "@/emails/ReadyForPickupEmail";
import InvoiceIssuedEmail,   { type InvoiceIssuedEmailProps }   from "@/emails/InvoiceIssuedEmail";
import LowStockAlertEmail,   { type LowStockAlertEmailProps }   from "@/emails/LowStockAlertEmail";

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "noreply@dyvikamaskin.no";
const COMPANY_NAME = "Dyvika Maskin AS";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY ?? "";
  return new Resend(key || "re_placeholder_key_for_local_dev");
}

export interface EmailResult {
  ok:    boolean;
  id?:   string;
  error?: string;
}

// ─── Order confirmed ──────────────────────────────────────────────────────────

export async function sendOrderConfirmedEmail(
  to: string,
  props: OrderConfirmedEmailProps
): Promise<EmailResult> {
  try {
    const html = await render(OrderConfirmedEmail(props));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from:    `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject: `Bestillingsbekreftelse – ordre ${props.orderId}`,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendOrderConfirmedEmail failed", err);
    return { ok: false, error: String(err) };
  }
}

// ─── Invoice issued (with PDF attachment) ────────────────────────────────────

export async function sendInvoiceIssuedEmail(
  to: string,
  props: InvoiceIssuedEmailProps,
  pdfBuffer: Buffer,
  filename: string
): Promise<EmailResult> {
  try {
    const html = await render(InvoiceIssuedEmail(props));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from:    `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject: `Faktura ${props.invoiceNumber} fra ${COMPANY_NAME}`,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendInvoiceIssuedEmail failed", err);
    return { ok: false, error: String(err) };
  }
}

// ─── Shipped ──────────────────────────────────────────────────────────────────

export async function sendShippedEmail(
  to: string,
  props: ShippedEmailProps
): Promise<EmailResult> {
  try {
    const html = await render(ShippedEmail(props));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from:    `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject: `Ordren din er sendt – ordre ${props.orderId}`,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendShippedEmail failed", err);
    return { ok: false, error: String(err) };
  }
}

// ─── Ready for pickup ─────────────────────────────────────────────────────────

export async function sendReadyForPickupEmail(
  to: string,
  props: ReadyForPickupEmailProps
): Promise<EmailResult> {
  try {
    const html = await render(ReadyForPickupEmail(props));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from:    `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject: `Ordren din er klar for henting – ${props.storeName}`,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendReadyForPickupEmail failed", err);
    return { ok: false, error: String(err) };
  }
}

// ─── Low stock alert ──────────────────────────────────────────────────────────

export async function sendLowStockAlertEmail(
  to: string,
  props: LowStockAlertEmailProps
): Promise<EmailResult> {
  try {
    const html = await render(LowStockAlertEmail(props));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from:    `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject: `Lavt lager-varsel – ${props.storeName}`,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendLowStockAlertEmail failed", err);
    return { ok: false, error: String(err) };
  }
}
