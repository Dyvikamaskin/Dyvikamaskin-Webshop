/**
 * Provider-agnostic SMS service.
 *
 * The active provider is selected via the SMS_PROVIDER env var:
 *   sveve       — Sveve.no   (Norwegian, simple REST, no key — just user/passwd)
 *   gatewayapi  — GatewayAPI (EU, bearer token)
 *   46elks      — 46elks     (EU, HTTP Basic auth)
 *
 * All providers implement the same interface:
 *   send(to: string, message: string) → Promise<SmsResult>
 *
 * Phone numbers should be in E.164 format (+4712345678).
 * Norwegian 8-digit numbers are auto-normalised.
 */

export interface SmsResult {
  ok:      boolean;
  provider: string;
  error?:  string;
}

// ─── Normalise phone numbers ──────────────────────────────────────────────────

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Norwegian 8-digit number → add +47
  if (digits.length === 8) return "+47" + digits;
  // Already has country code (e.g. 4712345678)
  if (!digits.startsWith("+")) return "+" + digits;
  return digits;
}

// ─── Provider: Sveve.no ───────────────────────────────────────────────────────

async function sendViaSveve(to: string, message: string): Promise<SmsResult> {
  const user   = process.env.SVEVE_USER   ?? "";
  const passwd = process.env.SVEVE_PASSWD ?? "";
  const sender = process.env.SMS_SENDER   ?? "DyvikaMaskin";

  const params = new URLSearchParams({
    user,
    passwd,
    to:  to.replace(/^\+/, ""),   // Sveve wants digits without +
    msg: message,
    f:   sender,
  });

  try {
    const res = await fetch("https://sveve.no/SMS/SendMessage?" + params.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    // Sveve returns "OK" prefix on success
    if (body.startsWith("OK")) return { ok: true, provider: "sveve" };
    return { ok: false, provider: "sveve", error: body.trim() };
  } catch (err) {
    return { ok: false, provider: "sveve", error: String(err) };
  }
}

// ─── Provider: GatewayAPI ─────────────────────────────────────────────────────

async function sendViaGatewayApi(to: string, message: string): Promise<SmsResult> {
  const token  = process.env.GATEWAYAPI_TOKEN ?? "";
  const sender = process.env.SMS_SENDER       ?? "DyvikaMaskin";

  try {
    const res = await fetch("https://gatewayapi.com/rest/mtsms", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        sender,
        message,
        recipients: [{ msisdn: to.replace(/^\+/, "") }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, provider: "gatewayapi" };
    const err = await res.text();
    return { ok: false, provider: "gatewayapi", error: err };
  } catch (err) {
    return { ok: false, provider: "gatewayapi", error: String(err) };
  }
}

// ─── Provider: 46elks ────────────────────────────────────────────────────────

async function sendVia46elks(to: string, message: string): Promise<SmsResult> {
  const username = process.env.ELKS_USERNAME ?? "";
  const password = process.env.ELKS_PASSWORD ?? "";
  const sender   = process.env.SMS_SENDER    ?? "DyvikaMaskin";

  const body = new URLSearchParams({
    from:    sender,
    to,
    message,
  });

  try {
    const res = await fetch("https://api.46elks.com/a1/SMS", {
      method:  "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, provider: "46elks" };
    const err = await res.text();
    return { ok: false, provider: "46elks", error: err };
  } catch (err) {
    return { ok: false, provider: "46elks", error: String(err) };
  }
}

// ─── Public send function ─────────────────────────────────────────────────────

/**
 * Send an SMS via the configured provider.
 *
 * @param to       Phone number — E.164 or Norwegian 8-digit (auto-normalised)
 * @param message  Text message — kept to 160 chars for single-segment delivery
 */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const provider = (process.env.SMS_PROVIDER ?? "").toLowerCase();
  const normTo   = normalisePhone(to);

  // Guard: skip in test/dev environments unless SMS is explicitly enabled
  if (!provider) {
    console.info("[sms] SMS_PROVIDER not set — skipping send to", normTo);
    return { ok: true, provider: "noop" };
  }

  switch (provider) {
    case "sveve":      return sendViaSveve(normTo, message);
    case "gatewayapi": return sendViaGatewayApi(normTo, message);
    case "46elks":     return sendVia46elks(normTo, message);
    default:
      console.warn("[sms] Unknown SMS_PROVIDER:", provider);
      return { ok: false, provider, error: "Unknown provider" };
  }
}
