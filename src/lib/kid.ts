/**
 * KID (Kundeidentifikasjon) number generation.
 *
 * KID is used on Norwegian bank transfer invoices so the payee can be
 * identified automatically. We embed the invoice sequence number and
 * append a MOD10 (Luhn) check digit.
 *
 * Format: year(4) + seq(6) + checkDigit(1) = 11 digits
 * Example: invoice "2026-000001" → KID "20260000011"
 */

// ─── MOD10 (Luhn) ────────────────────────────────────────────────────────────

function mod10CheckDigit(digits: string): string {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a KID number from an invoice number like "2026-000001".
 * The "-" separator is stripped; a MOD10 check digit is appended.
 */
export function generateKid(invoiceNumber: string): string {
  const base = invoiceNumber.replace("-", ""); // e.g. "2026000001"
  return base + mod10CheckDigit(base);          // e.g. "20260000011"
}

/**
 * Verify that a KID number has a valid MOD10 check digit.
 */
export function verifyKid(kid: string): boolean {
  if (kid.length < 2) return false;
  return mod10CheckDigit(kid.slice(0, -1)) === kid.slice(-1);
}
