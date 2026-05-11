/**
 * Email service — thin wrapper around Resend.
 *
 * Provides typed send functions for each notification type.
 * All functions are fire-and-forget safe: they never throw;
 * errors are logged and the result is returned.
 *
 * Phase 9 — marketing consent gate. Sends classified as MARKETING look
 * up the recipient's `Profile.marketingConsentAt` and skip if null.
 * TRANSACTIONAL sends (order/shipping/invoice) always go through —
 * required for the merchant to fulfil the customer contract regardless
 * of marketing opt-in. The classification per send-fn is documented
 * inline; auditors can read off which sends are gated.
 *
 * Resend free tier: 3,000 emails/month.
 * RESEND_API_KEY env var must be set in production.
 */

import { Resend } from "resend";
import { render } from "@react-email/components";
import { prisma } from "@/lib/prisma";

import OrderConfirmedEmail,  { type OrderConfirmedEmailProps }  from "@/emails/OrderConfirmedEmail";
import ShippedEmail,         { type ShippedEmailProps }         from "@/emails/ShippedEmail";
import ReadyForPickupEmail,  { type ReadyForPickupEmailProps }  from "@/emails/ReadyForPickupEmail";
import InvoiceIssuedEmail,   { type InvoiceIssuedEmailProps }   from "@/emails/InvoiceIssuedEmail";
import LowStockAlertEmail,   { type LowStockAlertEmailProps }   from "@/emails/LowStockAlertEmail";
import QuoteSentEmail,       { type QuoteSentEmailProps }       from "@/emails/QuoteSentEmail";

export type EmailPurpose = "TRANSACTIONAL" | "MARKETING";

/**
 * Centralised consent gate. For MARKETING sends, returns false unless
 * the recipient's profile has marketingConsentAt set. TRANSACTIONAL
 * always passes.
 *
 * Recipients without a Profile (e.g. ad-hoc admin alerts, low-stock
 * emails to staff) bypass the gate — the lookup is keyed by email,
 * and a missing row is treated as "no profile, no consent required".
 */
export async function canSendEmail(
  toEmail: string,
  purpose: EmailPurpose,
): Promise<boolean> {
  if (purpose === "TRANSACTIONAL") return true;
  try {
    const profile = await prisma.profile.findUnique({
      where: { email: toEmail.toLowerCase().trim() },
      select: { marketingConsentAt: true },
    });
    if (!profile) return true; // no profile, no consent gate
    return profile.marketingConsentAt != null;
  } catch (err) {
    console.error("[email] consent lookup failed; failing closed for marketing", err);
    return false;
  }
}

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

// ─── Quote sent (transactional — RFQ response) ──────────────────────────────

export async function sendQuoteSentEmail(
  to: string,
  props: QuoteSentEmailProps,
): Promise<EmailResult> {
  try {
    const html = await render(QuoteSentEmail(props));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject: `Tilbud ${props.quoteNumber} fra Dyvikamaskin`,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendQuoteSentEmail failed", err);
    return { ok: false, error: String(err) };
  }
}

// ─── Marketing (consent-gated) ───────────────────────────────────────────────

/**
 * Send a marketing email. Gates on Profile.marketingConsentAt — returns
 * { ok: false, error: "no_consent" } if the recipient hasn't opted in.
 * Callers should NOT log this as a hard failure; it's the expected
 * outcome for the vast majority of recipients.
 */
export async function sendMarketingEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailResult> {
  if (!(await canSendEmail(to, "MARKETING"))) {
    return { ok: false, error: "no_consent" };
  }
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `${COMPANY_NAME} <${FROM_ADDRESS}>`,
      to,
      subject,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] sendMarketingEmail failed", err);
    return { ok: false, error: String(err) };
  }
}
