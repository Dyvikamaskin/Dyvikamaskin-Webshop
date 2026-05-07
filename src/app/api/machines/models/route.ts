import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MachineType } from "@/app/generated/prisma/enums";

export async function GET(req: NextRequest) {
  const makeId = req.nextUrl.searchParams.get("makeId")?.trim();
  if (!makeId) {
    return NextResponse.json({ error: "makeId parameter required" }, { status: 400 });
  }

  const typeParam = req.nextUrl.searchParams.get("type")?.trim();

  const models = await prisma.machineModel.findMany({
    where: {
      makeId,
      ...(typeParam && Object.values(MachineType).includes(typeParam as MachineType)
        ? { type: typeParam as MachineType }
        : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      series: true,
      yearFrom: true,
      yearTo: true,
    },
  });

  return NextResponse.json(models);
}
