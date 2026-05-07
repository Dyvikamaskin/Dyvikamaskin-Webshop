/**
 * Warehouse Location Code — helpers
 *
 * Format:  ZONE-AISLE-RACK-SHELF-SLOT
 * Example: PLUKK-A-01-B-03
 *          HØYLAGER-B-05-C-02
 *          UTE-A-01-A-01
 *
 * Uniqueness is enforced at DB level: StoreStock(storeId, locationCode).
 */

// ─── Zone definitions ─────────────────────────────────────────────────────────

export const LOCATION_ZONES = [
  { value: "PLUKK",    label: "Plukklager" },
  { value: "HØYLAGER", label: "Høylager" },
  { value: "UTE",      label: "Uteareal" },
  { value: "INNLEV",   label: "Innleveringsområde" },
  { value: "KAR",      label: "Karantene" },
  { value: "RETUR",    label: "Returlager" },
] as const;

export type LocationZone = (typeof LOCATION_ZONES)[number]["value"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationParts {
  zone:  string; // e.g. "PLUKK"
  aisle: string; // e.g. "A"
  rack:  string; // e.g. "01"
  shelf: string; // e.g. "B"
  slot:  string; // e.g. "03"
}

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Assembles the five parts into the canonical code string.
 * Returns null if any required part is missing or invalid.
 */
export function buildLocationCode(parts: Partial<LocationParts>): string | null {
  const { zone, aisle, rack, shelf, slot } = parts;

  if (!zone || !aisle || !rack || !shelf || !slot) return null;

  const aisleClean = aisle.trim().toUpperCase();
  const rackClean  = rack.trim().replace(/\D/g, "").padStart(2, "0");
  const shelfClean = shelf.trim().toUpperCase();
  const slotClean  = slot.trim().replace(/\D/g, "").padStart(2, "0");

  if (!aisleClean || !rackClean || !shelfClean || !slotClean) return null;
  if (rackClean === "00" || slotClean === "00") return null;

  return `${zone}-${aisleClean}-${rackClean}-${shelfClean}-${slotClean}`;
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Parses a canonical location code back into its five parts.
 * Returns null if the code is not in valid format.
 *
 * Works with both 5-segment codes (ZONE-A-01-B-03) and
 * zones containing a hyphen are not supported — zones must be single words.
 */
export function parseLocationCode(code: string): LocationParts | null {
  if (!code) return null;

  const parts = code.split("-");
  if (parts.length !== 5) return null;

  const [zone, aisle, rack, shelf, slot] = parts;

  if (!zone || !aisle || !rack || !shelf || !slot) return null;

  return { zone, aisle, rack, shelf, slot };
}

// ─── Validate ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the string is a well-formed location code.
 */
export function isValidLocationCode(code: string): boolean {
  return parseLocationCode(code) !== null;
}

// ─── Display ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for a location code.
 * e.g. "PLUKK-A-01-B-03" → "Plukklager · Gang A · Hylle 01 · Nivå B · Plass 03"
 */
export function locationCodeLabel(code: string): string {
  const parts = parseLocationCode(code);
  if (!parts) return code;

  const zoneDef = LOCATION_ZONES.find((z) => z.value === parts.zone);
  const zoneLabel = zoneDef?.label ?? parts.zone;

  return `${zoneLabel} · Gang ${parts.aisle} · Reol ${parts.rack} · Nivå ${parts.shelf} · Plass ${parts.slot}`;
}

/**
 * Returns a short badge label: "A-01-B-03" (omitting the zone).
 */
export function locationCodeShort(code: string): string {
  const parts = parseLocationCode(code);
  if (!parts) return code;
  return `${parts.aisle}-${parts.rack}-${parts.shelf}-${parts.slot}`;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Comparator for sorting location codes in warehouse order:
 * zone → aisle → rack → shelf → slot
 */
export function compareLocationCodes(a: string, b: string): number {
  const pa = parseLocationCode(a);
  const pb = parseLocationCode(b);

  if (!pa && !pb) return a.localeCompare(b);
  if (!pa) return 1;
  if (!pb) return -1;

  return (
    pa.zone.localeCompare(pb.zone)       ||
    pa.aisle.localeCompare(pb.aisle)     ||
    pa.rack.localeCompare(pb.rack)       ||
    pa.shelf.localeCompare(pb.shelf)     ||
    pa.slot.localeCompare(pb.slot)
  );
}
