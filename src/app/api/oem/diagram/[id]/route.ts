import { NextResponse, type NextRequest } from "next/server";
import { oemPrisma } from "@/lib/oem-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const diagram = await oemPrisma.diagram.findUnique({
    where: { id },
    include: {
      revision: {
        include: {
          machine: { select: { code: true, modelName: true } },
        },
      },
    },
  });

  if (!diagram) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: diagram.id,
    name: diagram.name,
    revisionId: diagram.revisionId,
    machineCode: diagram.revision.machine.code,
    modelName: diagram.revision.machine.modelName,
  });
}
