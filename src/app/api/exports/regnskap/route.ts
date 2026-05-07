import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus } from "@/app/generated/prisma/enums";

/**
 * GET /api/exports/regnskap?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Streams a UTF-8 CSV (with BOM for Norwegian Excel compatibility) of all
 * PAID and INVOICED orders in the given date range.
 * Only STORE_MANAGER+ may access this endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(UserRole.STORE_MANAGER);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp   = request.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to   = sp.get("to")   ?? "";

  if (!from || !to) {
    return NextResponse.json({ error: "Mangler from/to parameter" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate   = new Date(to + "T23:59:59.999Z");

  const sales = await prisma.sale.findMany({
    where: {
      status:    { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
      createdAt: { gte: fromDate, lte: toDate },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id:              true,
      invoiceNumber:   true,
      kidNumber:       true,
      createdAt:       true,
      paidAt:          true,
      invoiceDueDate:  true,
      subtotalExclMva: true,
      mvaAmount:       true,
      shippingCost:    true,
      totalPrice:      true,
      status:          true,
      orderSource:     true,
      isPickup:        true,
      customer: {
        select: {
          fullName:    true,
          companyName: true,
          orgNumber:   true,
          email:       true,
        },
      },
      store: { select: { name: true } },
    },
  });

  // ── Build CSV ─────────────────────────────────────────────────────────────

  // Semicolon separator, comma decimal  — Norwegian Excel standard
  const sep = ";";

  function num(val: { toNumber(): number } | number): string {
    const n = typeof val === "number" ? val : val.toNumber();
    return n.toFixed(2).replace(".", ",");
  }

  function esc(value: string | null | undefined): string {
    const s = value ?? "";
    // Wrap in quotes if it contains the separator, quotes, or newlines
    if (s.includes(sep) || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const headers = [
    "Fakturanr",
    "Ordredato",
    "Betalingsdato",
    "Forfallsdato",
    "Kundenavn",
    "Selskap",
    "Orgnr",
    "E-post",
    "Butikk",
    "Kilde",
    "Hentested",
    `Subtotal ekskl${sep} MVA`,
    "MVA-beløp",
    "Frakt",
    `Totalt inkl${sep} MVA`,
    "KID",
    "Status",
  ];

  const rows: string[] = [
    headers.map(esc).join(sep),
    ...sales.map((s) =>
      [
        esc(s.invoiceNumber),
        esc(s.createdAt.toISOString().slice(0, 10)),
        esc(s.paidAt?.toISOString().slice(0, 10) ?? ""),
        esc(s.invoiceDueDate?.toISOString().slice(0, 10) ?? ""),
        esc(s.customer?.fullName ?? ""),
        esc(s.customer?.companyName ?? ""),
        esc(s.customer?.orgNumber ?? ""),
        esc(s.customer?.email ?? ""),
        esc(s.store.name),
        esc(s.orderSource),
        esc(s.isPickup ? "Ja" : "Nei"),
        num(s.subtotalExclMva),
        num(s.mvaAmount),
        num(s.shippingCost),
        num(s.totalPrice),
        esc(s.kidNumber ?? ""),
        esc(s.status),
      ].join(sep)
    ),
  ];

  // UTF-8 BOM + CRLF line endings (Excel on Windows)
  const BOM = "﻿";
  const csv = BOM + rows.join("\r\n");

  const filename = `regnskap_${from}_${to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
