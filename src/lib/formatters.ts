/**
 * Display formatters — Phase 2 (Money correctness).
 *
 * Display-side is intentionally permissive: it accepts Prisma.Decimal,
 * a decimal-formatted string, or a raw number. The strict-input rule
 * lives in `pricing.ts` (where coercion would silently lose precision).
 * Once a value reaches the formatter, computation is done.
 */
import { Prisma } from "@/app/generated/prisma/client";

const noLocale = "nb-NO";
const D = Prisma.Decimal;

/** Anything a formatter is willing to render. */
export type Displayable = Prisma.Decimal | string | number;

function asDecimal(value: Displayable): Prisma.Decimal {
  return value instanceof D ? value : new D(value);
}

// ─── Number formatters ────────────────────────────────────────────────────────

/** Norwegian-style number: 1 234,50 */
export function formatNumber(value: Displayable, decimals = 2): string {
  return new Intl.NumberFormat(noLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(asDecimal(value).toNumber());
}

// ─── Price formatters ─────────────────────────────────────────────────────────

/** Raw price string without MVA label. Example: "1 234,50 kr" */
export function formatPrice(amount: Displayable): string {
  return `${formatNumber(amount)} kr`;
}

/**
 * Consumer (B2C) price line. Returns the full display including MVA note.
 *
 *   total:   "1 543,13 kr inkl. MVA"
 *   mvaLine: "hvorav MVA 25%: 308,63 kr"
 */
export function formatConsumerPrice(
  priceExMva: Displayable,
  mvaRate: Displayable = "0.25",
): { total: string; mvaLine: string } {
  const base = asDecimal(priceExMva);
  const rate = asDecimal(mvaRate);
  const mva = base.mul(rate);
  const total = base.plus(mva);
  const pct = rate.mul(100).toDecimalPlaces(0).toString();

  return {
    total: `${formatNumber(total)} kr inkl. MVA`,
    mvaLine: `hvorav MVA ${pct}%: ${formatNumber(mva)} kr`,
  };
}

/** Business (B2B) price — excludes MVA. Example: "1 234,50 kr eks. MVA" */
export function formatBusinessPrice(priceExMva: Displayable): string {
  return `${formatNumber(priceExMva)} kr eks. MVA`;
}

/** MVA amount only — used in B2B checkout summaries. Example: "308,63 kr" */
export function formatMva(
  priceExMva: Displayable,
  mvaRate: Displayable = "0.25",
): string {
  const mva = asDecimal(priceExMva).mul(asDecimal(mvaRate));
  return `${formatNumber(mva)} kr`;
}

// ─── Date formatters ──────────────────────────────────────────────────────────

/** Norwegian short date: 31.12.2025 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(noLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Norwegian date + time: 31.12.2025 kl. 14:30 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const datePart = formatDate(d);
  const timePart = d.toLocaleTimeString(noLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} kl. ${timePart}`;
}
