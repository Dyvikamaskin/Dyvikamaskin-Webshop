import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";

/**
 * GET /api/exports/low-stock
 *
 * CSV of every (Product × Store) where quantity is at or below the
 * row's lowStockThreshold. Groups by preferredSupplier so the buyer can
 * cut the file by supplier and forward each section as a PO. Phase 8.
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRole(UserRole.STORE_MANAGER);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.storeStock.findMany({
    where: {
      product: { isActive: true, isDiscontinued: false },
      quantity: { lte: prisma.storeStock.fields.lowStockThreshold },
    },
    include: {
      product: {
        select: {
          sku: true,
          name: true,
          brand: true,
          partNumber: true,
          purchasePrice: true,
          preferredSupplier: { select: { name: true, email: true, orgNumber: true } },
        },
      },
      store: { select: { name: true } },
    },
    orderBy: [
      { product: { brand: "asc" } },
      { product: { name: "asc" } },
    ],
  });

  const sep = ";";
  const esc = (v: string) => {
    if (v.includes(sep) || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const headers = [
    "Leverandør",
    "Leverandør e-post",
    "Leverandør orgnr",
    "Butikk",
    "SKU",
    "Delenr.",
    "Merke",
    "Produktnavn",
    "Innkjøpspris (kr)",
    "På lager",
    "Lav-grense",
    "Foreslått bestilling",
  ];

  const lines: string[] = [headers.map(esc).join(sep)];

  for (const r of rows) {
    const suggested = Math.max(0, r.lowStockThreshold * 2 - r.quantity);
    lines.push(
      [
        esc(r.product.preferredSupplier?.name ?? "(ingen)"),
        esc(r.product.preferredSupplier?.email ?? ""),
        esc(r.product.preferredSupplier?.orgNumber ?? ""),
        esc(r.store.name),
        esc(r.product.sku),
        esc(r.product.partNumber ?? ""),
        esc(r.product.brand ?? ""),
        esc(r.product.name),
        esc(r.product.purchasePrice?.toString() ?? ""),
        String(r.quantity),
        String(r.lowStockThreshold),
        String(suggested),
      ].join(sep),
    );
  }

  const BOM = "﻿";
  const csv = BOM + lines.join("\r\n");
  const filename = `lav-lager_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
