import { NextResponse, type NextRequest } from "next/server";
import { oemPrisma } from "@/lib/oem-db";
import * as fs from "fs";
import * as path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const diagram = await oemPrisma.diagram.findUnique({
    where: { id },
    select: { diagramImageKey: true },
  });

  if (!diagram?.diagramImageKey) {
    return NextResponse.json({ hotspots: [], globalx: 1000, globaly: 1000 });
  }

  // PNG filename ends in "g.png"; hd3 drops the "g"
  // e.g. "100_0006566101003g.png" → "100_0006566101003.hd3"
  const hd3Name = diagram.diagramImageKey.replace(/g\.png$/i, ".hd3");
  const hd3Path = path.join(process.cwd(), "data", "eparts_assets", hd3Name);

  if (!fs.existsSync(hd3Path)) {
    return NextResponse.json({ hotspots: [], globalx: 1000, globaly: 1000 });
  }

  try {
    const raw = JSON.parse(fs.readFileSync(hd3Path, "utf8"));
    const globalx = Number(raw.header?.globalx ?? 1000);
    const globaly = Number(raw.header?.globaly ?? 1000);
    const rects: Array<{ id: number; x1: number; y1: number; x2: number; y2: number }> = [];

    for (const r of raw.definition?.rectangle ?? []) {
      const [a, b] = r.co ?? [];
      if (!a || !b) continue;
      rects.push({
        id: Number(r.id),
        x1: Math.min(a.x, b.x),
        y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x),
        y2: Math.max(a.y, b.y),
      });
    }

    return NextResponse.json({ hotspots: rects, globalx, globaly });
  } catch {
    return NextResponse.json({ hotspots: [], globalx: 1000, globaly: 1000 });
  }
}
