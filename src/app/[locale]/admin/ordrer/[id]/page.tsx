import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  UserRole,
  OrderStatus,
  FulfillmentStatus,
} from "@/app/generated/prisma/enums";
import {
  updateOrderStatusFormAction,
  updateFulfillmentStatusFormAction,
} from "@/app/actions/admin";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ordredetaljer — Admin" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const { id } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          companyName: true,
          address: true,
          postalCode: true,
          city: true,
        },
      },
      store: { select: { name: true, address: true, city: true } },
      createdByAdmin: { select: { fullName: true, email: true } },
      items: {
        include: { product: { select: { sku: true, name: true } } },
      },
    },
  });

  if (!sale) notFound();

  // ── Bound server actions for this order (void-returning for <form action>) ─
  const updateOrderStatus = updateOrderStatusFormAction.bind(null, sale.id);
  const updateFulfillmentStatus = updateFulfillmentStatusFormAction.bind(null, sale.id);

  return (
    <div style={{ padding: "2rem", maxWidth: "960px" }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1.25rem" }}>
        <Link href="/admin/ordrer" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Tilbake til ordrer
        </Link>
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Ordre
        </h1>
        <code style={{ fontSize: "0.875rem", color: "#475569", background: "#f1f5f9", padding: "0.2rem 0.6rem", borderRadius: "4px" }}>
          {sale.id}
        </code>
        <StatusBadge status={sale.status} />
        <FulfillmentBadge status={sale.fulfillmentStatus} />
        {/* Picking list download — opens in new tab */}
        <a
          href={`/api/picking-list/${sale.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: "auto",
            padding: "0.4rem 1rem",
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          📋 Last ned plukkliste
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>
        {/* Customer */}
        <Card title="Kunde">
          {sale.customer ? (
            <>
              <Row label="Navn" value={sale.customer.fullName} />
              {sale.customer.companyName && (
                <Row label="Bedrift" value={sale.customer.companyName} />
              )}
              <Row label="E-post" value={sale.customer.email} />
              {sale.customer.phoneNumber && (
                <Row label="Telefon" value={sale.customer.phoneNumber} />
              )}
              {sale.customer.address && (
                <Row
                  label="Adresse"
                  value={`${sale.customer.address}, ${sale.customer.postalCode} ${sale.customer.city}`}
                />
              )}
              <div style={{ marginTop: "0.75rem" }}>
                <Link
                  href={`/admin/kunder/${sale.customer.id}`}
                  style={{ color: "#2563eb", fontSize: "0.8rem", textDecoration: "none" }}
                >
                  Vis kundeprofil →
                </Link>
              </div>
            </>
          ) : (
            <p style={{ color: "#94a3b8", margin: 0 }}>Gjesteordre – ingen kundeprofil</p>
          )}
        </Card>

        {/* Order meta */}
        <Card title="Ordredetaljer">
          <Row label="Butikk" value={sale.store.name} />
          <Row label="Kilde" value={sale.orderSource === "PHONE" ? "Telefonordre" : "Nettbutikk"} />
          <Row label="Henting" value={sale.isPickup ? "Ja – hentes i butikk" : "Nei – frakt"} />
          {sale.invoiceNumber && <Row label="Fakturanr." value={sale.invoiceNumber} />}
          {sale.trackingNumber && <Row label="Sporingsnr." value={sale.trackingNumber} />}
          <Row label="Opprettet" value={sale.createdAt.toLocaleString("nb-NO")} />
          {sale.paidAt && <Row label="Betalt" value={sale.paidAt.toLocaleString("nb-NO")} />}
          {sale.invoiceDueDate && (
            <Row label="Forfaller" value={sale.invoiceDueDate.toLocaleDateString("nb-NO")} />
          )}
          {sale.createdByAdmin && (
            <Row label="Opprettet av" value={sale.createdByAdmin.fullName} />
          )}
        </Card>
      </div>

      {/* Order items */}
      <Card title="Varelinjer" style={{ marginBottom: "1.25rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              {["SKU", "Produktnavn", "Antall", "Enhetspris (eks MVA)", "Linjepris (inkl MVA)", "Rabatt"].map((h) => (
                <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#334155" }}>
                  {item.sku}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#1e293b" }}>{item.productName}</td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#374151", textAlign: "right" }}>{item.quantity}</td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#374151", textAlign: "right", whiteSpace: "nowrap" }}>
                  {formatNok(item.unitPriceExclMva)}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#1e293b", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>
                  {formatNok(item.lineTotalInclMva)}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#64748b", textAlign: "right" }}>
                  {Number(item.discountPercentage) > 0
                    ? `${Number(item.discountPercentage).toFixed(0)}%`
                    : "–"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #e2e8f0" }}>
              <td colSpan={4} style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#475569" }}>
                Subtotal (eks MVA):
              </td>
              <td style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                {formatNok(sale.subtotalExclMva)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={4} style={{ padding: "0.25rem 0.75rem", textAlign: "right", color: "#64748b" }}>
                MVA:
              </td>
              <td style={{ padding: "0.25rem 0.75rem", textAlign: "right", color: "#64748b", whiteSpace: "nowrap" }}>
                {formatNok(sale.mvaAmount)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={4} style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
                Totalt:
              </td>
              <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700, fontSize: "1rem", color: "#0f172a", whiteSpace: "nowrap" }}>
                {formatNok(sale.totalPrice)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        {/* Update order status */}
        <Card title="Oppdater betalingsstatus">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {([OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.INVOICED] as const).map(
              (s) => (
                <form key={s} action={updateOrderStatus.bind(null, s)}>
                  <button
                    type="submit"
                    disabled={sale.status === s}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      background: sale.status === s ? "#2563eb" : "#f8fafc",
                      color: sale.status === s ? "#fff" : "#374151",
                      fontWeight: 600,
                      cursor: sale.status === s ? "default" : "pointer",
                      fontSize: "0.875rem",
                    }}
                  >
                    {sale.status === s ? "✓ " : ""}
                    {statusLabel(s)}
                  </button>
                </form>
              )
            )}
          </div>
        </Card>

        {/* Update fulfillment status */}
        <Card title="Oppdater ekspederingsstatus">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(
              [
                FulfillmentStatus.UNFULFILLED,
                FulfillmentStatus.PROCESSING,
                FulfillmentStatus.SHIPPED,
                FulfillmentStatus.READY_FOR_PICKUP,
                FulfillmentStatus.COLLECTED,
              ] as const
            ).map((s) => (
              <form key={s} action={updateFulfillmentStatus.bind(null, s)}>
                <button
                  type="submit"
                  disabled={sale.fulfillmentStatus === s}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: sale.fulfillmentStatus === s ? "#0f172a" : "#f8fafc",
                    color: sale.fulfillmentStatus === s ? "#fff" : "#374151",
                    fontWeight: 600,
                    cursor: sale.fulfillmentStatus === s ? "default" : "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  {sale.fulfillmentStatus === s ? "✓ " : ""}
                  {fulfillmentLabel(s)}
                </button>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNok(value: { toString(): string } | null | undefined) {
  return Number(value ?? 0).toLocaleString("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 2,
  });
}

function statusLabel(s: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    PENDING: "Venter",
    AUTHORIZED: "Reservert",
    PAID: "Betalt",
    INVOICED: "Fakturert",
    REFUNDED: "Refundert",
    CANCELLED: "Avbrutt",
    AWAITING_STOCK: "Venter på lager",
  };
  return labels[s] ?? s;
}

function fulfillmentLabel(s: FulfillmentStatus): string {
  return (
    {
      UNFULFILLED: "Uekspedert",
      PROCESSING: "Behandles",
      SHIPPED: "Sendt",
      READY_FOR_PICKUP: "Klar for henting",
      COLLECTED: "Hentet",
    }[s] ?? s
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.375rem", fontSize: "0.875rem" }}>
      <span style={{ color: "#64748b", minWidth: "120px", flexShrink: 0 }}>{label}:</span>
      <span style={{ color: "#1e293b" }}>{value}</span>
    </div>
  );
}

function Card({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        padding: "1.25rem",
        ...style,
      }}
    >
      <h2
        style={{
          fontSize: "0.9rem",
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.875rem",
          margin: "0 0 0.875rem",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Venter",    bg: "#fef9c3", color: "#854d0e" },
    PAID:     { label: "Betalt",    bg: "#dcfce7", color: "#166534" },
    INVOICED: { label: "Fakturert", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.7rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    UNFULFILLED:      { label: "Uekspedert",      bg: "#fee2e2", color: "#991b1b" },
    PROCESSING:       { label: "Behandles",       bg: "#fef3c7", color: "#92400e" },
    SHIPPED:          { label: "Sendt",           bg: "#dbeafe", color: "#1e40af" },
    READY_FOR_PICKUP: { label: "Klar for henting", bg: "#ede9fe", color: "#5b21b6" },
    COLLECTED:        { label: "Hentet",          bg: "#dcfce7", color: "#166534" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.7rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
