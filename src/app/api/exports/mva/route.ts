import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole, OrderStatus } from "@/app/generated/prisma/enums";

/**
 * GET /api/exports/mva?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns a UTF-8 CSV (BOM + semicolons) summarising MVA by rate for the
 * given period. Suitable for manual entry into the Norwegian VAT declaration.
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

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        status:    { in: [OrderStatus.PAID, OrderStatus.INVOICED] },
        createdAt: { gte: fromDate, lte: toDate },
      },
    },
    select: {
      mvaRate:          true,
      lineTotalExclMva: true,
      lineTotalInclMva: true,
      saleId:           true,
    },
  });

  // Aggregate by rate. Sums are Decimal end-to-end — this is the
  // authoritative MVA-tax CSV submitted to Skatteetaten, so per-line
  // float coercion is not safe here.
  const map = new Map<
    string,
    { excl: Prisma.Decimal; incl: Prisma.Decimal; sales: Set<string> }
  >();
  for (const item of items) {
    const rateKey = item.mvaRate.toFixed(4);
    const g =
      map.get(rateKey) ??
      {
        excl: new Prisma.Decimal(0),
        incl: new Prisma.Decimal(0),
        sales: new Set<string>(),
      };
    g.excl = g.excl.plus(item.lineTotalExclMva);
    g.incl = g.incl.plus(item.lineTotalInclMva);
    g.sales.add(item.saleId);
    map.set(rateKey, g);
  }

  const groups = Array.from(map.entries())
    .map(([rateKey, g]) => {
      const rate = parseFloat(rateKey);
      return {
        pct:        `${Math.round(rate * 100)} %`,
        orderCount: g.sales.size,
        excl:       g.excl,
        mva:        g.incl.minus(g.excl),
        incl:       g.incl,
      };
    })
    .sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

  const sep = ";";

  function num(d: Prisma.Decimal): string {
    return d.toFixed(2).replace(".", ",");
  }

  function esc(v: string): string {
    if (v.includes(sep) || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }

  const headers = [
    "Periode",
    "MVA-sats",
    "Antall ordrer",
    `Grunnlag ekskl${sep} MVA`,
    "MVA-beløp",
    `Totalt inkl${sep} MVA`,
  ];

  const periodLabel = `${from} – ${to}`;

  const rows: string[] = [
    headers.map(esc).join(sep),
    ...groups.map((g) =>
      [
        esc(periodLabel),
        esc(g.pct),
        String(g.orderCount),
        num(g.excl),
        num(g.mva),
        num(g.incl),
      ].join(sep)
    ),
  ];

  // Grand total row
  if (groups.length > 0) {
    const grand = groups.reduce(
      (acc, g) => ({
        excl: acc.excl.plus(g.excl),
        mva: acc.mva.plus(g.mva),
        incl: acc.incl.plus(g.incl),
      }),
      {
        excl: new Prisma.Decimal(0),
        mva: new Prisma.Decimal(0),
        incl: new Prisma.Decimal(0),
      },
    );
    rows.push(
      [
        esc(periodLabel),
        esc("Totalt"),
        String(groups.reduce((s, g) => s + g.orderCount, 0)),
        num(grand.excl),
        num(grand.mva),
        num(grand.incl),
      ].join(sep)
    );
  }

  const BOM = "﻿";
  const csv = BOM + rows.join("\r\n");
  const filename = `mva_${from}_${to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
