/**
 * Batch slot determination — Phase 7
 *
 * Determines whether an order falls into the MORGEN or ETTERMIDDAG
 * fulfilment batch based on the store's configured cutoff times and
 * the current Oslo wall-clock time.
 *
 * Store.batchCutoffMorgen     default "11:00"
 * Store.batchCutoffEttermiddag  default "15:00"
 *
 * Rules:
 *   current time < MORGEN cutoff   → MORGEN (same day)
 *   MORGEN ≤ time < ETTERMIDDAG    → ETTERMIDDAG (same day)
 *   time ≥ ETTERMIDDAG             → MORGEN (next working day — caller decides)
 */

import { BatchSlot } from "@/app/generated/prisma/enums";

const OSLO_TZ = "Europe/Oslo";

/**
 * Parse a "HH:MM" string into hours + minutes numbers.
 */
function parseTime(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/**
 * Get the current Oslo time as minutes since midnight.
 */
function osloMinutesSinceMidnight(now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: OSLO_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h * 60 + m;
}

/**
 * Determine the batch slot for an order placed right now.
 *
 * @param batchCutoffMorgen      — e.g. "11:00"
 * @param batchCutoffEttermiddag — e.g. "15:00"
 * @param now                    — defaults to Date.now() (injectable for tests)
 */
export function determineBatchSlot(
  batchCutoffMorgen = "11:00",
  batchCutoffEttermiddag = "15:00",
  now: Date = new Date()
): BatchSlot {
  const currentMinutes = osloMinutesSinceMidnight(now);
  const morgenCutoff = parseTime(batchCutoffMorgen);
  const ettermiddagCutoff = parseTime(batchCutoffEttermiddag);

  const morgenMinutes = morgenCutoff.h * 60 + morgenCutoff.m;
  const ettermiddagMinutes = ettermiddagCutoff.h * 60 + ettermiddagCutoff.m;

  if (currentMinutes < morgenMinutes) return BatchSlot.MORGEN;
  if (currentMinutes < ettermiddagMinutes) return BatchSlot.ETTERMIDDAG;
  // After ettermiddag cutoff → assign to next morning's batch
  return BatchSlot.MORGEN;
}
