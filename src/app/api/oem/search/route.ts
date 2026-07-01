import { NextResponse, type NextRequest } from "next/server";
import { oemPrisma } from "@/lib/oem-db";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const machines = await oemPrisma.machine.findMany({
    where: {
      source: "EPARTS_API",
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { modelName: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      code: true,
      displayName: true,
      modelName: true,
      categoryPath: true,
      isDiscontinued: true,
      _count: { select: { revisions: true } },
    },
    orderBy: [{ isDiscontinued: "asc" }, { displayName: "asc" }],
    take: 40,
  });

  return NextResponse.json(machines);
}
