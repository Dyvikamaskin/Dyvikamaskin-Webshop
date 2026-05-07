import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const makes = await prisma.machineMake.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(makes);
}
