// Shared helpers for the OEM ETL pipeline.
import "dotenv/config";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Client as PgClient } from "pg";

/// Random ID generator for PK columns. Schema declares `@default(cuid())`,
/// which Prisma runs client-side — bypassing Prisma we must provide IDs.
/// UUIDv4 is fine for these tables (String @id, no format constraint).
export function newId(): string {
  return crypto.randomUUID();
}

export const STATE_DIR = path.join(__dirname, "state");
fs.mkdirSync(STATE_DIR, { recursive: true });

export function loadJson<T>(name: string, fallback: T): T {
  const p = path.join(STATE_DIR, name);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function saveJson(name: string, data: unknown): void {
  fs.writeFileSync(path.join(STATE_DIR, name), JSON.stringify(data, null, 0));
}

export async function withClient<T>(
  url: string | undefined,
  fn: (c: PgClient) => Promise<T>,
): Promise<T> {
  if (!url) throw new Error("connection string not set");
  const c = new PgClient({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/// Canonical model token for cross-source joins.
///   "BPU 2540A US" -> "bpu2540aus"
///   "EZ38-2"       -> "ez382"
///   "TH627 (418-02)" -> "th627"   (drops parenthesised qualifiers)
export function canonicalModelToken(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop parenthesised qualifiers
    .replace(/[\s_\-/]+/g, "") // strip separators
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/// For a (partNumber, legacyPartNumber) pair from OemPart, pick the canonical
/// key — prefer legacy if present (the modern SAP code was already mapped
/// down to a known legacy), else fall back to the partNumber itself.
/// This matches the COALESCE("legacyPartNumber", "partNumber") logic in
/// the `oem_part_catalog` view (which never landed but the logic is fine).
export function canonicalPartKey(
  partNumber: string,
  legacyPartNumber: string | null,
): string {
  return legacyPartNumber ?? partNumber;
}

/// Pick the canonical modern partNumber from a set of codes (the inverse —
/// when we have multiple OemPart rows for the same canonical key, which
/// partNumber should the new Part.partNumber be?).
/// Preference: 5xxxxxxxxx (modern SAP) > 1xxxxxxxxx (big-equip) > 0xxxxxxx (legacy)
export function pickCanonicalPartNumber(codes: Iterable<string>): string {
  const set = new Set(codes);
  for (const c of set) {
    if (/^5\d{9}$/.test(c)) return c;
  }
  for (const c of set) {
    if (/^1\d{9}$/.test(c)) return c;
  }
  // fall back to the first stable-sorted code
  return [...set].sort()[0]!;
}

export function parseRevisionMode(
  revisionTag: string | null | undefined,
): "NUMERIC" | "SERIAL_RANGE" {
  if (!revisionTag) return "NUMERIC";
  if (/^WNC[A-Z0-9]+/i.test(revisionTag)) return "SERIAL_RANGE";
  if (/^\d{2,4}$/.test(revisionTag)) return "NUMERIC";
  // unknown shape — default to numeric
  return "NUMERIC";
}

/// Pull AF/AI + WNC range out of a sparepartsBookList[].name string.
const PAT_AFAI = /\((AF[A-Z0-9]+)(?:\s*\/\s*(AI[A-Z0-9]+))?\s*[-–—]\s*([^)]*?)\)/i;
const PAT_WNC = /\((WNC[A-Z0-9]+)\s*[-–—]\s*([A-Z0-9]*?)\s*\.?\.?\.?\s*\)/i;
export function parseSparepartsBookName(rawName: string | null | undefined): {
  afCode: string | null;
  aiCode: string | null;
  serialFrom: string | null;
  serialTo: string | null;
} {
  const afai = rawName ? PAT_AFAI.exec(rawName) : null;
  const wnc = rawName ? PAT_WNC.exec(rawName) : null;
  return {
    afCode: afai?.[1] ?? null,
    aiCode: afai?.[2] ?? null,
    serialFrom: wnc?.[1] ?? null,
    serialTo: wnc?.[2] || null,
  };
}

export function chunk<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function logProgress(label: string, n: number, total: number, started: number) {
  const elapsed = (Date.now() - started) / 1000;
  const rate = elapsed > 0 ? n / elapsed : 0;
  const eta = rate > 0 ? (total - n) / rate : 0;
  console.log(
    `  [${n.toLocaleString()}/${total.toLocaleString()}]  ` +
      `${(elapsed / 60).toFixed(1)} min · ${rate.toFixed(0)}/s · ETA ${(eta / 60).toFixed(1)} min  [${label}]`,
  );
}

export const PROD_URL = process.env.DIRECT_URL;
export const OEM_URL = process.env.OEM_DIRECT_URL;
