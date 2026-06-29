import { NextResponse, type NextRequest } from "next/server";
import { oemPrisma } from "@/lib/oem-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const lines = await oemPrisma.partLine.findMany({
    where: { diagramId: id },
    include: { part: { select: { partNumber: true, name: true, unitOfMeasure: true, isRecommended: true } } },
    orderBy: { callout: "asc" },
  });

  return NextResponse.json(lines);
}
