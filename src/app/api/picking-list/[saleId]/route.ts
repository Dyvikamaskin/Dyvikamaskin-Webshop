/**
 * GET /api/picking-list/[saleId]
 *
 * Generates and streams a picking list PDF for the given order.
 * Items are sorted by location code for efficient warehouse picking.
 * Requires FULFILLMENT_STAFF or above.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { renderPickingListPdf, type PickingListData } from "@/lib/picking-list-pdf";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const { saleId } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: { select: { fullName: true, email: true } },
      store:    { select: { name: true } },
      items: {
        include: {
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Ordre ikke funnet" }, { status: 404 });
  }

  // For each sale item, look up the current stock record to get the location code
  // We join via product + store to find the correct StoreStock row
  const stockRecords = await prisma.storeStock.findMany({
    where: {
      storeId:   sale.storeId,
      productId: { in: sale.items.map((i) => i.productId) },
    },
    select: { productId: true, locationCode: true },
  });

  const locationByProductId = new Map(
    stockRecords.map((s) => [s.productId, s.locationCode])
  );

  const pickingData: PickingListData = {
    saleId:        sale.id,
    orderSource:   sale.orderSource,
    createdAt:     sale.createdAt,
    storeName:     sale.store.name,
    customerName:  sale.customer?.fullName ?? "Gjestekunde",
    customerEmail: sale.customer?.email    ?? "",
    isPickup:      sale.isPickup,
    items: sale.items.map((item) => ({
      locationCode: locationByProductId.get(item.productId) ?? null,
      sku:          item.sku,
      productName:  item.productName,
      quantity:     item.quantity,
    })),
  };

  try {
    const pdfBuffer = await renderPickingListPdf(pickingData);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="plukkliste-${saleId.slice(0, 8)}.pdf"`,
        "Content-Length":      String(pdfBuffer.byteLength),
        "Cache-Control":       "private, no-store",
      },
    });
  } catch (err) {
    console.error("[picking-list] render error", err);
    const message = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
