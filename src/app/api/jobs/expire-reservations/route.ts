import { NextResponse, type NextRequest } from "next/server";
import { expireReservations } from "@/services/inventory/reservations";

/**
 * GET /api/jobs/expire-reservations
 *
 * Sweeps StockReservation rows whose expiresAt has passed. Returns the
 * number of rows removed. Authenticated by a shared secret in the
 * `Authorization` header (`Bearer ${CRON_SECRET}`).
 *
 * Scheduled sweeps run via the BullMQ `maintenance` queue (every minute,
 * `expire-reservations-cron`); this endpoint is now retained only as a
 * manual escape hatch for ops — useful if the workers are down or an
 * admin wants to force an immediate sweep. The Railway `curl` cron
 * service that previously hit this route on a schedule can be retired
 * once the BullMQ schedule is verified in production.
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
