import { NextResponse, type NextRequest } from "next/server";
import { oemPrisma } from "@/lib/oem-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const diagrams = await oemPrisma.diagram.findMany({
    where: { revisionId: id },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { lines: true } } },
  });

  return NextResponse.json(diagrams);
}
