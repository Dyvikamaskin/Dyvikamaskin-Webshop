import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateInvoiceForSale } from "@/lib/invoice-service";
import { renderInvoicePdf, type InvoiceData } from "@/lib/invoice-pdf";
import { getAuthUser } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";

// ─── Auth helper (API-safe — returns JSON 403, not redirect) ─────────────────

async function requireStaffJson(): Promise<
  | { ok: true; profileId: string; role: UserRole }
  | { ok: false; response: NextResponse }
> {
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ingen tilgang" },
        { status: 503 }
      ),
    };
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Ikke innlogget" }, { status: 401 }),
    };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });

  const STAFF_ROLES: UserRole[] = [
    UserRole.FULFILLMENT_STAFF,
    UserRole.STORE_MANAGER,
    UserRole.SUPER_ADMIN,
  ];

  if (!profile?.role || !STAFF_ROLES.includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ingen tilgang" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, profileId: profile.id, role: profile.role };
}

// ─── POST /api/invoices/[saleId] — generate invoice ─────────────────────────
//
// Body (optional JSON): { dueDays?: number }
//   dueDays = 0  → receipt (B2C Vipps paid, due immediately)
//   dueDays = 30 → B2B net-30 invoice
//
// Idempotent: if the sale already has an invoice, returns existing data.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const { saleId } = await params;

  let dueDays = 0;
  try {
    const body = await request.json();
    if (typeof body?.dueDays === "number") dueDays = body.dueDays;
  } catch {
    // no body — use default
  }

  try {
    const result = await generateInvoiceForSale(saleId, dueDays);
    return NextResponse.json(result, { status: result.alreadyExisted ? 200 : 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

// ─── GET /api/invoices/[saleId]/pdf — download PDF ───────────────────────────
//
// Returns the invoice as application/pdf.
// Accessible by staff OR the customer who placed the order.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser();
  } catch {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }

  const { saleId } = await params;

  // Fetch the sale with all data needed for the PDF
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        select: {
          sku: true,
          productName: true,
          quantity: true,
          unitPriceExclMva: true,
          mvaRate: true,
          lineTotalExclMva: true,
          lineTotalInclMva: true,
        },
      },
      customer: {
        select: {
          id: true,
          fullName: true,
          companyName: true,
          orgNumber: true,
          address: true,
          postalCode: true,
          city: true,
          email: true,
          role: true,
        },
      },
      store: {
        select: {
          name: true,
          address: true,
          postalCode: true,
          city: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Faktura ikke funnet" }, { status: 404 });
  }

  if (!sale.invoiceNumber) {
    return NextResponse.json(
      { error: "Faktura er ikke generert ennå" },
      { status: 409 }
    );
  }

  // Access check: staff can view any invoice; customers can only view their own
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });

  const STAFF_ROLES: UserRole[] = [
    UserRole.FULFILLMENT_STAFF,
    UserRole.STORE_MANAGER,
    UserRole.SUPER_ADMIN,
  ];

  const isStaff = profile?.role && STAFF_ROLES.includes(profile.role);
  const isOwner = sale.customer?.id === user.id;

  if (!isStaff && !isOwner) {
    return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
  }

  // Build InvoiceData
  const invoiceData: InvoiceData = {
    invoiceNumber: sale.invoiceNumber,
    kidNumber: sale.kidNumber ?? "",
    issuedAt: sale.createdAt,
    dueDate: sale.invoiceDueDate ?? sale.createdAt,
    customer: sale.customer
      ? {
          fullName: sale.customer.fullName,
          companyName: sale.customer.companyName,
          orgNumber: sale.customer.orgNumber,
          address: sale.customer.address,
          postalCode: sale.customer.postalCode,
          city: sale.customer.city,
          email: sale.customer.email,
        }
      : {
          fullName: "Ukjent kunde",
          email: "",
        },
    store: sale.store,
    items: sale.items,
    subtotalExclMva: sale.subtotalExclMva,
    mvaAmount: sale.mvaAmount,
    shippingCost: sale.shippingCost,
    totalPrice: sale.totalPrice,
  };

  try {
    const pdfBuffer = await renderInvoicePdf(invoiceData);

    const filename = `faktura-${sale.invoiceNumber}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[invoice-pdf] render error", err);
    return NextResponse.json({ error: "PDF-generering feilet" }, { status: 500 });
  }
}
