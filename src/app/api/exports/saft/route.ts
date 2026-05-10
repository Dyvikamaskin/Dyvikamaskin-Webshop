import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { buildSaftXml } from "@/lib/saft/build";

/**
 * GET /api/exports/saft?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * SAF-T Financial v1.10 (Norwegian) XML export. STORE_MANAGER+ only.
 * Streams the file as `attachment` so the browser downloads it.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(UserRole.STORE_MANAGER);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "Missing required query params: from, to (YYYY-MM-DD)" },
      { status: 400 },
    );
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const xml = await buildSaftXml({ fromDate, toDate });
  const filename = `SAF-T_${from}_${to}.xml`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
