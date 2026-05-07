/**
 * MyBring API client — Phase 9
 *
 * Covers:
 *   - Shipping Guide v2 (fetch rates for a parcel)
 *   - Booking API       (create consignment + fetch label PDF)
 *
 * Auth: API-key header pair — no token refresh needed.
 * Docs: https://developer.bring.com/api/shipping-guide_2/
 *       https://developer.bring.com/api/booking/
 */

const BRING_BASE = "https://api.bring.com";

// ─── Common Bring product codes ───────────────────────────────────────────────
// These are the most relevant products for a Norwegian B2B/B2C webshop.
// Full list: https://developer.bring.com/api/services/

export const BRING_PRODUCTS = {
  PAKKE_I_POSTKASSEN:    "PAKKE_I_POSTKASSEN",    // Letterbox parcel (≤2 kg)
  PAKKE_TIL_HENTESTED:  "PAKKE_TIL_HENTESTED",   // Pickup point parcel
  BEDRIFTSPAKKE:        "BEDRIFTSPAKKE",          // B2B delivery
  KLIMANEUTRAL_SERVICEPAKKE: "KLIMANØYTRAL_SERVICEPAKKE", // Eco service parcel
} as const;

export type BringProductId = (typeof BRING_PRODUCTS)[keyof typeof BRING_PRODUCTS] | string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function bringHeaders(): Record<string, string> {
  return {
    "X-Mybring-API-Uid": requiredEnv("MYBRING_API_ID"),
    "X-Mybring-API-Key": requiredEnv("MYBRING_API_KEY"),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ─── Shipping Guide ───────────────────────────────────────────────────────────

export interface ShippingRateParams {
  fromPostalCode: string;
  toPostalCode: string;
  /** Total weight in grams */
  weightInGrams: number;
  /** ISO date string "YYYY-MM-DD" — defaults to today */
  shippingDate?: string;
  /** Limit to specific product IDs; omit for all available products */
  productIds?: BringProductId[];
}

export interface ShippingProduct {
  id: string;
  name?: string;
  /** Price incl. VAT in NOK */
  priceInclVat: number;
  /** Price excl. VAT in NOK */
  priceExclVat: number;
  /** Formatted expected delivery date, e.g. "16.05.2026" */
  expectedDelivery?: string;
}

export interface ShippingRateResult {
  consignmentId: string;
  products: ShippingProduct[];
}

/**
 * Fetch available shipping products and prices from the Bring Shipping Guide v2.
 */
export async function fetchShippingRates(
  params: ShippingRateParams
): Promise<ShippingRateResult[]> {
  const today = new Date();
  const dateStr = params.shippingDate ?? today.toISOString().slice(0, 10);
  const [year, month, day] = dateStr.split("-").map(Number);

  const consignment: Record<string, unknown> = {
    id: "1",
    fromCountryCode: "NO",
    fromPostalCode: params.fromPostalCode,
    toCountryCode: "NO",
    toPostalCode: params.toPostalCode,
    packages: [{ id: "1", grossWeight: params.weightInGrams }],
    shippingDate: { year, month, day },
  };

  if (params.productIds?.length) {
    consignment.products = params.productIds.map((id) => ({ id }));
  }

  const body = {
    consignments: [consignment],
    withPrice: true,
    withExpectedDelivery: true,
  };

  const res = await fetch(
    `${BRING_BASE}/shippingguide/api/v2/products`,
    {
      method: "POST",
      headers: bringHeaders(),
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bring ShippingGuide ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    consignments: Array<{
      consignmentId: string;
      products?: Array<{
        id: string;
        productName?: string;
        price?: {
          listPrice?: {
            priceWithoutAdditionalServices?: {
              amountWithVAT?: string;
              amountWithoutVAT?: string;
            };
          };
        };
        expectedDelivery?: {
          formattedExpectedDeliveryDate?: string;
        };
        errors?: unknown[];
      }>;
    }>;
  };

  return (data.consignments ?? []).map((c) => ({
    consignmentId: c.consignmentId,
    products: (c.products ?? [])
      .filter((p) => !p.errors?.length)
      .map((p) => ({
        id: p.id,
        name: p.productName,
        priceInclVat: parseFloat(
          p.price?.listPrice?.priceWithoutAdditionalServices?.amountWithVAT ?? "0"
        ),
        priceExclVat: parseFloat(
          p.price?.listPrice?.priceWithoutAdditionalServices?.amountWithoutVAT ?? "0"
        ),
        expectedDelivery:
          p.expectedDelivery?.formattedExpectedDeliveryDate,
      })),
  }));
}

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface BookingAddress {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
  countryCode?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export interface BookingParams {
  productId: BringProductId;
  sender: BookingAddress;
  recipient: BookingAddress;
  /** Weight in kg */
  weightInKg: number;
  dimensions?: { lengthInCm: number; widthInCm: number; heightInCm: number };
  /** ISO datetime string — defaults to now */
  shippingDateTime?: string;
  /** Include X-Bring-Test-Indicator: true header for sandbox testing */
  testMode?: boolean;
}

export interface BookingResult {
  consignmentNumber: string;
  /** URL to fetch the label PDF */
  labelUrl: string;
  /** Direct tracking URL */
  trackingUrl: string;
  /** Package-level numbers */
  packageNumbers: string[];
}

/**
 * Book a shipment with Bring and return the consignment number + label URL.
 */
export async function bookShipment(
  params: BookingParams
): Promise<BookingResult> {
  const headers: Record<string, string> = {
    ...bringHeaders(),
    "X-Bring-Test-Indicator": params.testMode ? "true" : "false",
  };

  const consignment = {
    shippingDateTime: params.shippingDateTime ?? new Date().toISOString(),
    parties: {
      sender: {
        name: params.sender.name,
        addressLine: params.sender.addressLine,
        postalCode: params.sender.postalCode,
        city: params.sender.city,
        countryCode: params.sender.countryCode ?? "NO",
        contact: {
          name: params.sender.contactName ?? params.sender.name,
          email: params.sender.email ?? "",
          phoneNumber: params.sender.phone ?? "",
        },
      },
      recipient: {
        name: params.recipient.name,
        addressLine: params.recipient.addressLine,
        postalCode: params.recipient.postalCode,
        city: params.recipient.city,
        countryCode: params.recipient.countryCode ?? "NO",
        contact: {
          name: params.recipient.contactName ?? params.recipient.name,
          email: params.recipient.email ?? "",
          phoneNumber: params.recipient.phone ?? "",
        },
      },
    },
    product: {
      id: params.productId,
      customerNumber: requiredEnv("MYBRING_CUSTOMER_NUMBER"),
    },
    packages: [
      {
        weightInKg: params.weightInKg,
        ...(params.dimensions
          ? {
              dimensions: {
                heightInCm: params.dimensions.heightInCm,
                lengthInCm: params.dimensions.lengthInCm,
                widthInCm: params.dimensions.widthInCm,
              },
            }
          : {}),
      },
    ],
  };

  const res = await fetch(`${BRING_BASE}/booking/api/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({ consignments: [consignment], schemaVersion: 1 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bring Booking ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    consignments: Array<{
      confirmation?: {
        consignmentNumber?: string;
        links?: {
          labels?: string;
          tracking?: string;
        };
      };
      packages?: Array<{ packageNumber?: string }>;
      errors?: Array<{ message?: string }>;
    }>;
  };

  const result = data.consignments?.[0];

  if (!result) throw new Error("Bring booking: empty response");

  if (result.errors?.length) {
    const msg = result.errors.map((e) => e.message).join("; ");
    throw new Error(`Bring booking error: ${msg}`);
  }

  const confirmation = result.confirmation;
  if (!confirmation?.consignmentNumber) {
    throw new Error("Bring booking: missing consignmentNumber");
  }

  return {
    consignmentNumber: confirmation.consignmentNumber,
    labelUrl: confirmation.links?.labels ?? "",
    trackingUrl:
      confirmation.links?.tracking ??
      `https://tracking.bring.com/tracking.html?q=${confirmation.consignmentNumber}`,
    packageNumbers: (result.packages ?? [])
      .map((p) => p.packageNumber ?? "")
      .filter(Boolean),
  };
}

/**
 * Fetch the label PDF for an already-booked consignment.
 * Returns the raw PDF bytes.
 */
export async function fetchLabelPdf(labelUrl: string): Promise<Uint8Array> {
  const res = await fetch(labelUrl, { headers: bringHeaders() });
  if (!res.ok) {
    throw new Error(`Bring label fetch ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
