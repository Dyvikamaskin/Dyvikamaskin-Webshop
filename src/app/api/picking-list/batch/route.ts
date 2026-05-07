/**
 * GET /api/picking-list/batch?storeId=X&slot=MORGEN&date=2026-05-07
 *
 * Generates a consolidated picking list PDF for all active (UNFULFILLED /
 * PROCESSING) orders in the given batch slot for the given date.
 *
 * Requires FULFILLMENT_STAFF role (verified via Authorization cookie).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import {
  renderBatchPickingListPdf,
  type BatchPickingListData,
  type BatchOrderLine,
} from "@/lib/batch-picking-list-pdf";

export async function GET(req: NextRequest) {
  try {
    await requireRole(UserRole.FULFILLMENT_STAFF);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const storeId = searchParams.get("storeId");
  const slot    = searchParams.get("slot") as "MORGEN" | "ETTERMIDDAG" | null;
  const dateStr = searchParams.get("date"); // YYYY-MM-DD

  if (!storeId || !slot || !dateStr) {
    return NextResponse.json({ error: "storeId, slot og date er påkrevd" }, { status: 400 });
  }
  if (slot !== "MORGEN" && slot !== "ETTERMIDDAG") {
    return NextResponse.json({ error: "slot må være MORGEN eller ETTERMIDDAG" }, { status: 400 });
  }

  // Build date range (start of day → end of day in UTC; close enough for Norway)
  const dayStart = new Date(dateStr + "T00:00:00.000Z");
  const dayEnd   = new Date(dateStr + "T23:59:59.999Z");

  // Load the store
  const store = await prisma.store.findUnique({
    where:  { id: storeId },
    select: { id: true, name: true },
  });
  if (!store) return NextResponse.json({ error: "Butikk ikke funnet" }, { status: 404 });

  // Load all relevant sales
  const sales = await prisma.sale.findMany({
    where: {
      storeId,
      batchSlot: slot,
      fulfillmentStatus: { in: ["UNFULFILLED", "PROCESSING"] },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    select: {
      id:               true,
      isPickup:         true,
      customer: {
        select: { fullName: true },
      },
      items: {
        select: {
          sku:         true,
          productName: true,
          quantity:    true,
          product: {
            select: {
              stock: {
                where:  { storeId },
                select: { locationCode: true },
                take:   1,
              },
            },
          },
        },
      },
    },
  });

  if (sales.length === 0) {
    return NextResponse.json({ error: "Ingen aktive ordrer i denne batchen." }, { status: 404 });
  }

  // Build the PDF data
  const orders = sales.map((s) => ({
    saleId:       s.id,
    customerName: s.customer?.fullName ?? "Ukjent",
    isPickup:     s.isPickup,
    itemCount:    s.items.length,
  }));

  const lines: BatchOrderLine[] = [];
  for (const sale of sales) {
    for (const item of sale.items) {
      lines.push({
        saleId:       sale.id,
        locationCode: item.product.stock[0]?.locationCode ?? null,
        sku:          item.sku,
        productName:  item.productName,
        quantity:     item.quantity,
        customerName: sale.customer?.fullName ?? "Ukjent",
        isPickup:     sale.isPickup,
      });
    }
  }

  const data: BatchPickingListData = {
    storeName: store.name,
    batchSlot: slot,
    date:      new Date(dateStr).toLocaleDateString("nb-NO"),
    orders,
    lines,
  };

  const pdfBuffer = await renderBatchPickingListPdf(data);

  const slotLabel = slot === "MORGEN" ? "morgen" : "ettermiddag";
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="batch-plukkliste-${slotLabel}-${dateStr}.pdf"`,
      "Content-Length":      String(pdfBuffer.length),
    },
  });
}
