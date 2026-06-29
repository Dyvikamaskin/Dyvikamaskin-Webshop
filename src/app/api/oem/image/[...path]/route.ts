import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import fs from "fs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  // Only allow .png and .hd3 files; no path traversal
  const filename = segments.join("/");
  // Allow eparts files (root level .png/.hd3) and LS Engineers images (ls/ prefix .jpg/.png)
  if (!filename.match(/^(ls\/)?[\w.\-]+\.(png|hd3|jpg|jpeg|webp)$/)) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "eparts_assets", filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : filename.endsWith(".webp") ? "image/webp" : "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
