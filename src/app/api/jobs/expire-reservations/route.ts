import { NextResponse, type NextRequest } from "next/server";
import { expireReservations } from "@/services/inventory/reservations";

/**
 * GET /api/jobs/expire-reservations
 *
 * Sweeps StockReservation rows whose expiresAt has passed. Returns the
 * number of rows removed. Authenticated by a shared secret in the
 * `Authorization` header (`Bearer ${CRON_SECRET}`) so a Railway cron
 * service can hit it without a user session.
 *
 * BullMQ replaces this when Phase 4 lands.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const removed = await expireReservations();
  return NextResponse.json({ ok: true, removed });
}
