import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import BatchGroup from "./_BatchGroup";
import PickupQueue from "./_PickupQueue";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Batchutsending — Admin" };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get today's date as YYYY-MM-DD in Norway local time */
function getOsloDateString(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(new Date());
}

/** Norwegian display label */
function todayNb(): string {
  return new Date().toLocaleDateString("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BatchPage() {
  await requireRole(UserRole.FULFILLMENT_STAFF);

  const dateStr  = getOsloDateString();
  const dayStart = new Date(dateStr + "T00:00:00.000Z");
  const dayEnd   = new Date(dateStr + "T23:59:59.999Z");

  const stores = await prisma.store.findMany({
    where:   { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id:                     true,
      name:                   true,
      batchCutoffMorgen:      true,
      batchCutoffEttermiddag: true,
    },
  });

  // Load today's unfulfilled / processing orders per store + batch slot
  const activeSales = await prisma.sale.findMany({
    where: {
      fulfillmentStatus: { in: ["UNFULFILLED", "PROCESSING"] },
      status:            { in: ["PAID", "INVOICED"] },
      createdAt:         { gte: dayStart, lte: dayEnd },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id:                true,
      storeId:           true,
      batchSlot:         true,
      fulfillmentStatus: true,
      isPickup:          true,
      orderSource:       true,
      createdAt:         true,
      customer: {
        select: { fullName: true, email: true },
      },
      items: {
        select: {
          sku:         true,
          productName: true,
          quantity:    true,
          product: {
            select: {
              stock: {
                select: { storeId: true, locationCode: true },
              },
            },
          },
        },
      },
    },
  });

  // Load READY_FOR_PICKUP orders (not date-scoped — these persist until collected)
  const pickupSales = await prisma.sale.findMany({
    where: { fulfillmentStatus: "READY_FOR_PICKUP", isPickup: true },
    orderBy: { updatedAt: "asc" },
    select: {
      id:                true,
      storeId:           true,
      batchSlot:         true,
      fulfillmentStatus: true,
      createdAt:         true,
      updatedAt:         true,
      customer: {
        select: { fullName: true, email: true, phoneNumber: true },
      },
      store: { select: { name: true } },
      items: {
        select: { sku: true, productName: true, quantity: true },
      },
    },
  });

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Batchutsending
        </h1>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>{todayNb()}</span>
      </div>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "2rem" }}>
        Ordrer fordelt på morgenbatch og ettermiddagsbatch per lager.
        Kun betalte/fakturerte ordrer med status Ubehandlet eller Under behandling vises.
      </p>

      {stores.map((store) => {
        const morgenOrders = activeSales.filter(
          (s) => s.storeId === store.id && s.batchSlot === "MORGEN"
        );
        const ettermiddagOrders = activeSales.filter(
          (s) => s.storeId === store.id && s.batchSlot === "ETTERMIDDAG"
        );

        if (morgenOrders.length === 0 && ettermiddagOrders.length === 0) return null;

        return (
          <section key={store.id} style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                🏪 {store.name}
              </h2>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Kuttetider: morgen {store.batchCutoffMorgen} · ettermiddag {store.batchCutoffEttermiddag}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <BatchGroup
                storeId={store.id}
                storeName={store.name}
                slot="MORGEN"
                slotLabel={`☀ Morgenbatch (før ${store.batchCutoffMorgen})`}
                orders={morgenOrders.map((s) => ({
                  id:                s.id,
                  fulfillmentStatus: s.fulfillmentStatus,
                  isPickup:          s.isPickup,
                  orderSource:       s.orderSource,
                  createdAt:         s.createdAt.toISOString(),
                  customerName:      s.customer?.fullName ?? "Ukjent",
                  customerEmail:     s.customer?.email ?? "",
                  items: s.items.map((i) => ({
                    sku:          i.sku,
                    productName:  i.productName,
                    quantity:     i.quantity,
                    locationCode: i.product.stock.find((st) => st.storeId === store.id)?.locationCode ?? null,
                  })),
                }))}
                dateStr={dateStr}
              />
              <BatchGroup
                storeId={store.id}
                storeName={store.name}
                slot="ETTERMIDDAG"
                slotLabel={`🌤 Ettermiddagsbatch (før ${store.batchCutoffEttermiddag})`}
                orders={ettermiddagOrders.map((s) => ({
                  id:                s.id,
                  fulfillmentStatus: s.fulfillmentStatus,
                  isPickup:          s.isPickup,
                  orderSource:       s.orderSource,
                  createdAt:         s.createdAt.toISOString(),
                  customerName:      s.customer?.fullName ?? "Ukjent",
                  customerEmail:     s.customer?.email ?? "",
                  items: s.items.map((i) => ({
                    sku:          i.sku,
                    productName:  i.productName,
                    quantity:     i.quantity,
                    locationCode: i.product.stock.find((st) => st.storeId === store.id)?.locationCode ?? null,
                  })),
                }))}
                dateStr={dateStr}
              />
            </div>
          </section>
        );
      })}

      {activeSales.length === 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "3rem", textAlign: "center", color: "#94a3b8", marginBottom: "2rem" }}>
          <p style={{ margin: 0, fontSize: "1rem" }}>Ingen aktive ordrer i dag.</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
            Ordrer vises her etter betaling er bekreftet av Vipps.
          </p>
        </div>
      )}

      {/* ── Pickup queue ── */}
      {pickupSales.length > 0 && (
        <section style={{ marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", marginBottom: "1rem" }}>
            📦 Hentekø — Klar for henting ({pickupSales.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
            {pickupSales.map((s) => (
              <PickupQueue
                key={s.id}
                saleId={s.id}
                storeName={s.store.name}
                customerName={s.customer?.fullName ?? "Ukjent"}
                customerEmail={s.customer?.email ?? ""}
                customerPhone={s.customer?.phoneNumber ?? null}
                readySince={s.updatedAt.toISOString()}
                items={s.items}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
