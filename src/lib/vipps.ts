/**
 * Vipps ePayment API client — Phase 7
 *
 * Direct HTTP calls to the Vipps ePayment v1 API.
 * No SDK dependency — keeps the bundle lean and avoids version lock.
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
 */

// ─── Config ───────────────────────────────────────────────────────────────────

function vippsBase(): string {
  return (
    process.env.VIPPS_API_BASE_URL ??
    "https://api.vipps.no"
  );
}

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// ─── Access token (module-level cache) ────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 30_000) {
    return _cachedToken;
  }

  const clientId = requiredEnv("VIPPS_CLIENT_ID");
  const clientSecret = requiredEnv("VIPPS_CLIENT_SECRET");
  const subscriptionKey = requiredEnv("VIPPS_SUBSCRIPTION_KEY");

  const res = await fetch(`${vippsBase()}/accesstoken/get`, {
    method: "POST",
    headers: {
      "client_id": clientId,
      "client_secret": clientSecret,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vipps token error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: string;
  };

  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + parseInt(data.expires_in, 10) * 1000;

  return _cachedToken;
}

// ─── Shared headers ───────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": requiredEnv("VIPPS_SUBSCRIPTION_KEY"),
    "Merchant-Serial-Number": requiredEnv("VIPPS_MERCHANT_SERIAL_NUMBER"),
    "Vipps-System-Name": "industriparts",
    "Vipps-System-Version": "1.0",
    "Content-Type": "application/json",
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VippsAmount {
  currency: "NOK";
  /** Amount in øre (1 NOK = 100 øre) */
  value: number;
}

export interface CreatePaymentParams {
  /** Unique reference — used as checkoutSessionId */
  reference: string;
  /** Total amount in øre */
  amountInOre: number;
  /** Norwegian mobile number (8 digits, without +47 prefix) — optional */
  phoneNumber?: string;
  /** URL the user is redirected to after paying */
  returnUrl: string;
  description: string;
}

export interface CreatePaymentResult {
  reference: string;
  redirectUrl: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Create a new Vipps ePayment.
 * Returns { reference, redirectUrl } on success.
 */
export async function createVippsPayment(
  params: CreatePaymentParams
): Promise<CreatePaymentResult> {
  const headers = await authHeaders();

  const body: Record<string, unknown> = {
    amount: { currency: "NOK", value: params.amountInOre },
    paymentMethod: { type: "WALLET" },
    reference: params.reference,
    returnUrl: params.returnUrl,
    userFlow: "WEB_REDIRECT",
    paymentDescription: params.description,
  };

  if (params.phoneNumber) {
    body.customer = { phoneNumber: params.phoneNumber };
  }

  const res = await fetch(`${vippsBase()}/epayment/v1/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps createPayment ${res.status}: ${text}`);
  }

  const data = (await res.json()) as CreatePaymentResult;
  return data;
}

/**
 * Capture an authorised payment.
 * Call after verifying stock availability.
 */
export async function captureVippsPayment(
  reference: string,
  amountInOre: number
): Promise<void> {
  const headers = await authHeaders();

  const res = await fetch(
    `${vippsBase()}/epayment/v1/payments/${encodeURIComponent(reference)}/capture`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        modificationAmount: { currency: "NOK", value: amountInOre },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps capture ${res.status}: ${text}`);
  }
}

/**
 * Cancel a payment that has been authorised but not yet captured.
 */
export async function cancelVippsPayment(reference: string): Promise<void> {
  const headers = await authHeaders();

  const res = await fetch(
    `${vippsBase()}/epayment/v1/payments/${encodeURIComponent(reference)}/cancel`,
    { method: "POST", headers }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps cancel ${res.status}: ${text}`);
  }
}

/**
 * Issue a (partial) refund on a captured payment.
 */
export async function refundVippsPayment(
  reference: string,
  amountInOre: number
): Promise<void> {
  const headers = await authHeaders();

  const res = await fetch(
    `${vippsBase()}/epayment/v1/payments/${encodeURIComponent(reference)}/refund`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        modificationAmount: { currency: "NOK", value: amountInOre },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps refund ${res.status}: ${text}`);
  }
}

/**
 * Convert a NOK decimal to Vipps øre (integer).
 * Example: 149.90 NOK → 14990 øre
 */
export function toOre(nok: number): number {
  return Math.round(nok * 100);
}

/**
 * Verify an incoming webhook Authorization header.
 * Vipps sends the raw webhook secret as the header value.
 */
export function verifyWebhookAuthorization(authHeader: string | null): boolean {
  const secret = process.env.VIPPS_WEBHOOK_SECRET;
  if (!secret || !authHeader) return false;
  // Accept with or without "Bearer " prefix
  const incoming = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  return incoming === secret;
}

// ─── Webhook management ───────────────────────────────────────────────────────

/** All ePayment events we want to receive. */
export const VIPPS_WEBHOOK_EVENTS = [
  "epayments.payment.created.v1",
  "epayments.payment.authorized.v1",
  "epayments.payment.captured.v1",
  "epayments.payment.cancelled.v1",
  "epayments.payment.refunded.v1",
  "epayments.payment.aborted.v1",
  "epayments.payment.expired.v1",
  "epayments.payment.terminated.v1",
] as const;

export interface VippsWebhookRegistration {
  id:     string;
  url:    string;
  events: string[];
  /** Secret returned on creation — store this as VIPPS_WEBHOOK_SECRET */
  secret?: string;
}

/**
 * Register a new webhook endpoint with Vipps.
 * Returns the registration including the generated `secret` — store it as
 * VIPPS_WEBHOOK_SECRET in your environment variables.
 */
export async function registerVippsWebhook(
  webhookUrl: string
): Promise<VippsWebhookRegistration> {
  const headers = await authHeaders();

  const res = await fetch(`${vippsBase()}/webhooks/v1/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url:    webhookUrl,
      events: VIPPS_WEBHOOK_EVENTS,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps registerWebhook ${res.status}: ${text}`);
  }

  return res.json() as Promise<VippsWebhookRegistration>;
}

/**
 * List all webhooks registered for this merchant.
 */
export async function listVippsWebhooks(): Promise<VippsWebhookRegistration[]> {
  const headers = await authHeaders();

  const res = await fetch(`${vippsBase()}/webhooks/v1/webhooks`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps listWebhooks ${res.status}: ${text}`);
  }

  const data = await res.json() as { webhooks?: VippsWebhookRegistration[] };
  return data.webhooks ?? [];
}

/**
 * Delete a registered webhook by ID.
 */
export async function deleteVippsWebhook(id: string): Promise<void> {
  const headers = await authHeaders();

  const res = await fetch(
    `${vippsBase()}/webhooks/v1/webhooks/${encodeURIComponent(id)}`,
    { method: "DELETE", headers }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps deleteWebhook ${res.status}: ${text}`);
  }
}

/**
 * Quick connectivity check — tries to fetch the access token.
 * Returns true if credentials are valid, false otherwise.
 */
export async function testVippsConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getAccessToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
