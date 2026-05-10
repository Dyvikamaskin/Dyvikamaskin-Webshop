import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookShipment, fetchLabelPdf } from "@/lib/mybring";
import { getAuthUser } from "@/lib/auth";
import { captureSaleOnDispatch } from "@/services/payments/vipps";
import { UserRole, FulfillmentStatus } from "@/app/generated/prisma/enums";

// ─── Auth helper (API-safe — returns JSON, not redirect) ─────────────────────

async function requireStaffJson(): Promise<
  | { ok: true; profileId: string }
  | { ok: false; response: NextResponse }
> {
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Ikke innlogget" }, { status: 401 }),
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
      response: NextResponse.json({ error: "Ingen tilgang" }, { status: 403 }),
    };
  }

  return { ok: true, profileId: profile.id };
}

// ─── POST /api/shipping/labels/[saleId] — book shipment ──────────────────────
//
// Books a Bring shipment for the sale and records the tracking number.
// Returns { consignmentNumber, trackingUrl, labelUrl }.
//
// Body:
// {
//   productId:     string;   // Bring product ID e.g. "PAKKE_TIL_HENTESTED"
//   weightInKg:    number;   // package weight
//   dimensions?:  { lengthInCm, widthInCm, heightInCm }
//   testMode?:    boolean;   // use Bring sandbox (default: false)
// }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const { saleId } = await params;

  let body: {
    productId?: string;
    weightInKg?: number;
    dimensions?: { lengthInCm: number; widthInCm: number; heightInCm: number };
    testMode?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  if (!body.productId || !body.weightInKg) {
    return NextResponse.json(
      { error: "productId og weightInKg er påkrevd" },
      { status: 400 }
    );
  }

  // ── Load sale with store + customer ─────────────────────────────────────────
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      store: {
        select: {
          name: true,
          address: true,
          postalCode: true,
          city: true,
          phone: true,
          email: true,
        },
      },
      customer: {
        select: {
          fullName: true,
          companyName: true,
          address: true,
          postalCode: true,
          city: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Ordre ikke funnet" }, { status: 404 });
  }

  if (sale.isPickup) {
    return NextResponse.json(
      { error: "Ordre er merket som henting — ingen frakt nødvendig" },
      { status: 409 }
    );
  }

  if (!sale.customer) {
    return NextResponse.json(
      { error: "Ordre mangler kundeinfo — kan ikke bestille frakt" },
      { status: 409 }
    );
  }

  if (!sale.customer.address || !sale.customer.postalCode || !sale.customer.city) {
    return NextResponse.json(
      { error: "Kundens leveringsadresse er ufullstendig" },
      { status: 422 }
    );
  }

  // ── Book shipment ────────────────────────────────────────────────────────────
  try {
    const result = await bookShipment({
      productId: body.productId,
      sender: {
        name: sale.store.name,
        addressLine: sale.store.address,
        postalCode: sale.store.postalCode,
        city: sale.store.city,
        phone: sale.store.phone,
        email: sale.store.email,
      },
      recipient: {
        name: sale.customer.companyName ?? sale.customer.fullName,
        addressLine: sale.customer.address,
        postalCode: sale.customer.postalCode,
        city: sale.customer.city,
        contactName: sale.customer.fullName,
        email: sale.customer.email ?? "",
        phone: sale.customer.phoneNumber ?? "",
      },
      weightInKg: body.weightInKg,
      dimensions: body.dimensions,
      testMode: body.testMode ?? false,
    });

    // ── Capture-on-dispatch (Phase 3) ───────────────────────────────────────
    // Booking the shipping label IS the dispatch event. Capture the Vipps
    // payment (if applicable), decrement stock, and release reservations
    // before persisting the tracking info — that way the customer never
    // gets shipped goods we haven't charged for.
    const dispatch = await captureSaleOnDispatch(saleId);
    if (!dispatch.ok) {
      return NextResponse.json({ error: dispatch.error }, { status: 502 });
    }

    // ── Persist tracking info ──────────────────────────────────────────────────
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        trackingNumber: result.consignmentNumber,
        shippedAt: new Date(),
        fulfillmentStatus: FulfillmentStatus.SHIPPED,
        shippingProductId: body.productId,
      },
    });

    return NextResponse.json(
      {
        consignmentNumber: result.consignmentNumber,
        trackingUrl: result.trackingUrl,
        labelUrl: result.labelUrl,
        packageNumbers: result.packageNumbers,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[shipping/labels] book error", err);
    const message = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ─── GET /api/shipping/labels/[saleId] — fetch & stream label PDF ─────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const { saleId } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { trackingNumber: true },
  });

  if (!sale) {
    return NextResponse.json({ error: "Ordre ikke funnet" }, { status: 404 });
  }

  if (!sale.trackingNumber) {
    return NextResponse.json(
      { error: "Ingen fraktetikett registrert på denne ordren" },
      { status: 409 }
    );
  }

  // Construct the Bring label URL from the tracking number
  const labelUrl = `https://api.bring.com/booking/api/fetch/labels/${sale.trackingNumber}`;

  try {
    const pdfBytes = await fetchLabelPdf(labelUrl);

    return new Response(pdfBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="etikett-${sale.trackingNumber}.pdf"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[shipping/labels] fetch label error", err);
    const message = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
