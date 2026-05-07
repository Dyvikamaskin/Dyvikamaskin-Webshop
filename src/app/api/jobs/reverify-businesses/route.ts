import { NextResponse, type NextRequest } from "next/server";
import { reverifyBusinesses } from "@/lib/jobs/reverify-businesses";

/**
 * POST /api/jobs/reverify-businesses
 *
 * Triggers the weekly Brreg re-verification job.
 * Protected by CRON_SECRET — call from Railway's cron scheduler or pg_cron.
 *
 * Example Railway cron: 0 3 * * 1  (every Monday at 03:00 UTC)
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reverifyBusinesses();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[reverify-businesses]", error);
    return NextResponse.json(
      { error: "Job failed — see server logs." },
      { status: 500 }
    );
  }
}
