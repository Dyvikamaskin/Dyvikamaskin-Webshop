// ─── Number helpers ───────────────────────────────────────────────────────────

const noLocale = "nb-NO";

/**
 * Accepts a plain number or any Decimal-like object (Prisma Decimal).
 * Prisma's Decimal exposes .toNumber() — this covers both.
 */
type Numeric = number | { toNumber(): number };

function toNumber(value: Numeric): number {
  return typeof value === "number" ? value : value.toNumber();
}

/** Formats a number in Norwegian style: 1 234,50 */
export function formatNumber(value: Numeric, decimals = 2): string {
  return new Intl.NumberFormat(noLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

// ─── Price formatters ─────────────────────────────────────────────────────────

/**
 * Raw price string — no MVA label.
 * Example: "1 234,50 kr"
 */
export function formatPrice(amount: Numeric): string {
  return `${formatNumber(amount)} kr`;
}

/**
 * Consumer (B2C) price line.
 * Returns the full display including MVA note.
 *
 * Example:
 *   total:     "1 543,13 kr inkl. MVA"
 *   mvaLine:   "hvorav MVA 25%: 308,63 kr"
 */
export function formatConsumerPrice(
  priceExMva: Numeric,
  mvaRate: Numeric = 0.25
): { total: string; mvaLine: string } {
  const base = toNumber(priceExMva);
  const rate = toNumber(mvaRate);
  const mva = base * rate;
  const total = base + mva;
  const pct = Math.round(rate * 100);

  return {
    total: `${formatNumber(total)} kr inkl. MVA`,
    mvaLine: `hvorav MVA ${pct}%: ${formatNumber(mva)} kr`,
  };
}

/**
 * Business (B2B) price — excludes MVA.
 * Example: "1 234,50 kr eks. MVA"
 */
export function formatBusinessPrice(priceExMva: Numeric): string {
  return `${formatNumber(priceExMva)} kr eks. MVA`;
}

/**
 * MVA amount only — used in B2B checkout summaries.
 * Example: "308,63 kr"
 */
export function formatMva(
  priceExMva: Numeric,
  mvaRate: Numeric = 0.25
): string {
  const mva = toNumber(priceExMva) * toNumber(mvaRate);
  return `${formatNumber(mva)} kr`;
}

// ─── Date formatters ──────────────────────────────────────────────────────────

/**
 * Norwegian short date: 31.12.2025
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(noLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Norwegian date + time: 31.12.2025 kl. 14:30
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const datePart = formatDate(d);
  const timePart = d.toLocaleTimeString(noLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} kl. ${timePart}`;
}

// ─── MVA calculation helpers (server-side only) ───────────────────────────────

/** Add 25% MVA to a base price */
export function addMva(
  priceExMva: Numeric,
  mvaRate: Numeric = 0.25
): number {
  return toNumber(priceExMva) * (1 + toNumber(mvaRate));
}

/** Strip MVA from an inclusive price */
export function stripMva(
  priceInclMva: Numeric,
  mvaRate: Numeric = 0.25
): number {
  return toNumber(priceInclMva) / (1 + toNumber(mvaRate));
}

/** Round to 2 decimal places (for price calculations) */
export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}
