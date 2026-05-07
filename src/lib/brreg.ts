/**
 * Brreg (Brønnøysundregistrene) lookup service.
 * API: https://data.brreg.no/enhetsregisteret/api/enheter/{orgNumber}
 * Free — no authentication required.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrregEnhet {
  organisasjonsnummer: string;
  navn: string;
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
  };
  organisasjonsform?: { kode: string; beskrivelse: string };
  registrertIMvaregisteret?: boolean;
  /** ISO date string — present means company is dissolved */
  slettedato?: string;
  konkurs?: boolean;
  underAvvikling?: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a Norwegian organisation number using the modulo-11 checksum.
 * Weights: [3, 2, 7, 6, 5, 4, 3, 2] over the first 8 digits.
 * Control digit (position 9) = 0 if sum%11==0, else 11 - (sum%11).
 * A result of 10 is invalid (no single digit can represent it).
 */
export function validateOrgNumber(orgNumber: string): boolean {
  const clean = orgNumber.replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(clean)) return false;

  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const digits = clean.split("").map(Number);
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  const rest = sum % 11;
  if (rest === 1) return false; // would produce control digit 10 — invalid
  const controlDigit = rest === 0 ? 0 : 11 - rest;
  return controlDigit === digits[8];
}

// ─── API ──────────────────────────────────────────────────────────────────────

const BRREG_BASE = "https://data.brreg.no/enhetsregisteret/api/enheter";

/**
 * Looks up an organisation number in Brreg.
 * Returns null if:
 *   - The org number fails local modulo-11 validation
 *   - The API returns 404 (not found) or any non-OK status
 *
 * Responses are cached for 1 hour (Next.js fetch cache).
 * Call this from Server Components / Route Handlers only — never from the client.
 */
export async function lookupOrgNumber(
  orgNumber: string
): Promise<BrregEnhet | null> {
  const clean = orgNumber.replace(/[\s-]/g, "");

  if (!validateOrgNumber(clean)) return null;

  try {
    const res = await fetch(`${BRREG_BASE}/${clean}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!res.ok) return null;
    return (await res.json()) as BrregEnhet;
  } catch {
    return null;
  }
}

// ─── Business rules ───────────────────────────────────────────────────────────

/**
 * Returns true if the company is currently active.
 * Rejects companies that are dissolved, bankrupt, or under liquidation.
 */
export function isCompanyActive(enhet: BrregEnhet): boolean {
  return !enhet.slettedato && !enhet.konkurs && !enhet.underAvvikling;
}

/** Returns the primary address line from a BrregEnhet, or undefined. */
export function formatBrregAddress(enhet: BrregEnhet): string | undefined {
  const addr = enhet.forretningsadresse;
  if (!addr) return undefined;
  const street = addr.adresse?.join(", ") ?? "";
  const postal = addr.postnummer ? `${addr.postnummer} ${addr.poststed ?? ""}`.trim() : "";
  return [street, postal].filter(Boolean).join(", ") || undefined;
}
