import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { updateCustomerFormAction } from "@/app/actions/admin";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kundeprofil — Admin" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function KundeDetailPage({ params }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const { id } = await params;

  const profile = await prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      companyName: true,
      orgNumber: true,
      address: true,
      postalCode: true,
      city: true,
      customerType: true,
      defaultDiscount: true,
      creditLimit: true,
      isApprovedForInvoice: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!profile) notFound();

  // Recent orders
  const recentOrders = await prisma.sale.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      status: true,
      fulfillmentStatus: true,
      totalPrice: true,
      invoiceNumber: true,
    },
  });

  // Bound server action (FormData-compatible)
  const updateCustomer = updateCustomerFormAction.bind(null, id);

  return (
    <div style={{ padding: "2rem", maxWidth: "1000px" }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1.25rem" }}>
        <Link href="/admin/kunder" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Tilbake til kunder
        </Link>
      </nav>

      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", marginBottom: "1.75rem" }}>
        {profile.fullName}
        <span style={{ fontSize: "0.9rem", fontWeight: 400, color: "#64748b", marginLeft: "0.75rem" }}>
          {profile.email}
        </span>
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>
        {/* Profile info */}
        <Card title="Kontaktinfo">
          <Row label="Navn" value={profile.fullName} />
          <Row label="E-post" value={profile.email} />
          {profile.phoneNumber && <Row label="Telefon" value={profile.phoneNumber} />}
          {profile.companyName && <Row label="Bedrift" value={profile.companyName} />}
          {profile.orgNumber && <Row label="Org.nr." value={profile.orgNumber} />}
          {profile.address && (
            <Row
              label="Adresse"
              value={`${profile.address}, ${profile.postalCode ?? ""} ${profile.city ?? ""}`}
            />
          )}
          <Row
            label="Type"
            value={profile.customerType === "BUSINESS" ? "Bedriftskunde" : "Forbrukerkunde"}
          />
          <Row label="Registrert" value={profile.createdAt.toLocaleDateString("nb-NO")} />
        </Card>

        {/* CRM fields (editable) */}
        <Card title="CRM-innstillinger">
          <form action={updateCustomer}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {/* Default discount */}
              <label style={labelStyle}>
                Standard rabatt (%)
                <input
                  type="number"
                  name="defaultDiscount"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={Number(profile.defaultDiscount)}
                  style={inputStyle}
                />
              </label>

              {/* Credit limit */}
              <label style={labelStyle}>
                Kredittgrense (NOK, blank = ingen)
                <input
                  type="number"
                  name="creditLimit"
                  min={0}
                  step={1000}
                  defaultValue={profile.creditLimit ? Number(profile.creditLimit) : ""}
                  placeholder="f.eks. 50000"
                  style={inputStyle}
                />
              </label>

              {/* Invoice approval */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "#374151",
                }}
              >
                <input
                  type="checkbox"
                  name="isApprovedForInvoice"
                  value="true"
                  defaultChecked={profile.isApprovedForInvoice}
                  style={{ width: "16px", height: "16px" }}
                />
                Godkjent for fakturabetaling
              </label>

              {/* Active */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "#374151",
                }}
              >
                <input
                  type="checkbox"
                  name="isActive"
                  value="true"
                  defaultChecked={profile.isActive}
                  style={{ width: "16px", height: "16px" }}
                />
                Konto er aktiv
              </label>

              <button
                type="submit"
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  alignSelf: "flex-start",
                  marginTop: "0.25rem",
                }}
              >
                Lagre endringer
              </button>
            </div>
          </form>
        </Card>
      </div>

      {/* Recent orders */}
      <Card title={`Ordrehistorikk (siste ${recentOrders.length})`}>
        {recentOrders.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Ingen ordrer enda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                {["Ordre-ID", "Dato", "Status", "Fullføring", "Fakturanr.", "Totalt", ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((sale) => (
                <tr key={sale.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#334155" }}>
                    {sale.id.slice(0, 10)}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#64748b", fontSize: "0.8rem" }}>
                    {sale.createdAt.toLocaleDateString("nb-NO")}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <StatusBadge status={sale.status} />
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <FulfillmentBadge status={sale.fulfillmentStatus} />
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#64748b", fontSize: "0.8rem" }}>
                    {sale.invoiceNumber ?? "–"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#1e293b", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {Number(sale.totalPrice).toLocaleString("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <Link
                      href={`/admin/ordrer/${sale.id}`}
                      style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.8rem" }}
                    >
                      Vis →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.375rem", fontSize: "0.875rem" }}>
      <span style={{ color: "#64748b", minWidth: "130px", flexShrink: 0 }}>{label}:</span>
      <span style={{ color: "#1e293b" }}>{value}</span>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        padding: "1.25rem",
      }}
    >
      <h2
        style={{
          fontSize: "0.875rem",
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "0 0 0.875rem",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#1e293b",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: "Venter",    bg: "#fef9c3", color: "#854d0e" },
    PAID:     { label: "Betalt",    bg: "#dcfce7", color: "#166534" },
    INVOICED: { label: "Fakturert", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status] ?? { label: status, bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: s.bg, color: s.color }}>
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
    <span style={{ display: "inline-block", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
