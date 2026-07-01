import { NextResponse, type NextRequest } from "next/server";
import { oemPrisma } from "@/lib/oem-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const machine = await oemPrisma.machine.findFirst({
    where: { code, source: "EPARTS_API" },
    include: {
      revisions: {
        orderBy: { revisionTag: "desc" },
        select: {
          id: true,
          revisionTag: true,
          rawName: true,
          hasBom: true,
          sparePartListCode: true,
          partsManualUrl: true,
          partsManualFilename: true,
          operatingManuals: true,
          serialFrom: true,
          serialTo: true,
          _count: { select: { diagrams: true } },
        },
      },
    },
  });

  if (!machine) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(machine);
}
