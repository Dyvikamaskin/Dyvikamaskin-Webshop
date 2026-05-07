/**
 * POST /api/labels/warehouse
 *
 * Generates and streams an A4 PDF of warehouse location labels.
 *
 * Body: { storeStockIds: string[] }  — list of StoreStock IDs to label
 *   OR: { storeId: string }           — all products in a store
 *
 * Returns: application/pdf
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { renderLabelsPdf, type LabelData } from "@/lib/label-pdf";

async function requireStaffJson(): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try { user = await getAuthUser(); } catch {
    return { ok: false, response: NextResponse.json({ error: "Ikke innlogget" }, { status: 401 }) };
  }
  if (!user) return { ok: false, response: NextResponse.json({ error: "Ikke innlogget" }, { status: 401 }) };

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  const allowed: UserRole[] = [UserRole.FULFILLMENT_STAFF, UserRole.STORE_MANAGER, UserRole.SUPER_ADMIN];
  if (!profile?.role || !allowed.includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: "Ingen tilgang" }, { status: 403 }) };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  let body: { storeStockIds?: string[]; storeId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  // ── Resolve which stock records to label ────────────────────────────────────
  let stockRecords: {
    id: string;
    locationCode: string | null;
    product: { sku: string; partNumber: string | null; name: string };
    store: { name: string };
  }[] = [];

  if (body.storeStockIds && body.storeStockIds.length > 0) {
    stockRecords = await prisma.storeStock.findMany({
      where: { id: { in: body.storeStockIds } },
      include: {
        product: { select: { sku: true, partNumber: true, name: true } },
        store: { select: { name: true } },
      },
    });
  } else if (body.storeId) {
    stockRecords = await prisma.storeStock.findMany({
      where: { storeId: body.storeId, product: { isActive: true } },
      orderBy: { locationCode: "asc" },
      include: {
        product: { select: { sku: true, partNumber: true, name: true } },
        store: { select: { name: true } },
      },
    });
  } else {
    return NextResponse.json({ error: "Oppgi storeStockIds eller storeId" }, { status: 400 });
  }

  if (stockRecords.length === 0) {
    return NextResponse.json({ error: "Ingen varer funnet" }, { status: 404 });
  }
  if (stockRecords.length > 200) {
    return NextResponse.json({ error: "Maks 200 etiketter per forespørsel" }, { status: 400 });
  }

  // ── Sort by location code so labels come out warehouse-ordered ──────────────
  const labels: LabelData[] = stockRecords
    .sort((a, b) => {
      if (!a.locationCode && !b.locationCode) return a.product.sku.localeCompare(b.product.sku);
      if (!a.locationCode) return 1;
      if (!b.locationCode) return -1;
      return a.locationCode.localeCompare(b.locationCode);
    })
    .map((s) => ({
      locationCode: s.locationCode,
      sku:          s.product.sku,
      partNumber:   s.product.partNumber,
      productName:  s.product.name,
      storeName:    s.store.name,
    }));

  try {
    const pdfBuffer = await renderLabelsPdf(labels);
    const storeName = stockRecords[0]?.store.name ?? "lager";
    const filename  = `etiketter-${storeName.toLowerCase().replace(/\s+/g, "-")}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(pdfBuffer.byteLength),
        "Cache-Control":       "private, no-store",
      },
    });
  } catch (err) {
    console.error("[labels/warehouse] render error", err);
    const message = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
