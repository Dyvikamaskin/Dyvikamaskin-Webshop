import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import { compareLocationCodes, LOCATION_ZONES } from "@/lib/location-code";
import LocationRow from "./_LocationRow";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Lagerlokasjoner — Admin" };

interface Props {
  searchParams: Promise<{
    storeId?: string;
    zone?: string;
    missing?: string; // "1" = only show unassigned
    q?: string;
  }>;
}

export default async function LagerPage({ searchParams }: Props) {
  await requireRole(UserRole.STORE_MANAGER);

  const params = await searchParams;
  const query        = params.q?.trim() ?? "";
  const zoneFilter   = params.zone ?? "";
  const missingOnly  = params.missing === "1";

  // Load all stores for the store-selector
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selectedStoreId = params.storeId ?? stores[0]?.id ?? "";

  // Load stock for selected store
  const rawStock = await prisma.storeStock.findMany({
    where: {
      storeId: selectedStoreId,
      product: { isActive: true },
      ...(missingOnly && { locationCode: null }),
      ...(zoneFilter && { locationCode: { startsWith: zoneFilter + "-" } }),
      ...(query && {
        product: {
          OR: [
            { sku:  { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      }),
    },
    select: {
      id: true,
      quantity: true,
      locationCode: true,
      product: { select: { sku: true, name: true, brand: true } },
    },
  });

  // Sort by location code (unset items go to end)
  const stock = [...rawStock].sort((a, b) => {
    if (!a.locationCode && !b.locationCode) return a.product.sku.localeCompare(b.product.sku);
    if (!a.locationCode) return 1;
    if (!b.locationCode) return -1;
    return compareLocationCodes(a.locationCode, b.locationCode);
  });

  const assignedCount = rawStock.filter((s) => s.locationCode).length;
  const totalCount    = rawStock.length;

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      storeId: selectedStoreId,
      zone: zoneFilter || undefined,
      missing: missingOnly ? "1" : undefined,
      q: query || undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/admin/lager?${p.toString()}`;
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.5rem" }}>
        Lagerlokasjoner
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Tildel hierarkisk lokasjonskode til hvert produkt i lageret.
        Format: <code style={{ background: "#f1f5f9", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>SONE-GANG-REOL-NIVÅ-PLASS</code>
      </p>

      {/* ── Store selector + filters ─────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.25rem" }}>
        {/* Store picker */}
        {stores.length > 1 && (
          <label style={filterLabelStyle}>
            Butikk / lager
            <StoreSelector stores={stores} selectedStoreId={selectedStoreId} buildUrl={buildUrl} />
          </label>
        )}

        {/* Search */}
        <form method="get" action="/admin/lager" style={{ display: "flex", gap: "0.4rem" }}>
          <input type="hidden" name="storeId" value={selectedStoreId} />
          {zoneFilter && <input type="hidden" name="zone" value={zoneFilter} />}
          {missingOnly && <input type="hidden" name="missing" value="1" />}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={filterLabelText}>Søk</span>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                name="q"
                defaultValue={query}
                placeholder="SKU eller produktnavn…"
                style={{ padding: "0.45rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.875rem", width: "220px" }}
              />
              <button type="submit" style={filterBtnStyle}>Søk</button>
            </div>
          </div>
        </form>

        {/* Zone filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={filterLabelText}>Sone</span>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <a href={buildUrl({ zone: undefined })} style={pill(!zoneFilter)}>Alle</a>
            {LOCATION_ZONES.map((z) => (
              <a key={z.value} href={buildUrl({ zone: z.value })} style={pill(zoneFilter === z.value)}>
                {z.label}
              </a>
            ))}
          </div>
        </div>

        {/* Missing only toggle */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={filterLabelText}>Vis</span>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <a href={buildUrl({ missing: undefined })} style={pill(!missingOnly)}>Alle</a>
            <a href={buildUrl({ missing: "1" })} style={pill(missingOnly)}>Mangler kode</a>
          </div>
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", fontSize: "0.8rem", color: "#64748b" }}>
        <span>
          <strong style={{ color: "#1e293b" }}>{totalCount}</strong> produkter i {stores.find((s) => s.id === selectedStoreId)?.name ?? "valgt lager"}
        </span>
        <span>
          <strong style={{ color: "#166534" }}>{assignedCount}</strong> med lokasjonskode
        </span>
        <span>
          <strong style={{ color: assignedCount < totalCount ? "#dc2626" : "#166534" }}>
            {totalCount - assignedCount}
          </strong>{" "}
          uten lokasjonskode
        </span>
        {totalCount > 0 && (
          <span>
            Dekningsgrad:{" "}
            <strong style={{ color: "#0f172a" }}>
              {Math.round((assignedCount / totalCount) * 100)}%
            </strong>
          </span>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["SKU", "Produktnavn", "Beholdning", "Lokasjonskode"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "0.625rem 1rem",
                    textAlign: h === "Beholdning" ? "right" : "left",
                    fontWeight: 600,
                    color: "#475569",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => (
              <LocationRow
                key={s.id}
                storeStockId={s.id}
                sku={s.product.sku}
                productName={s.product.name}
                quantity={s.quantity}
                currentCode={s.locationCode}
              />
            ))}
            {stock.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                  {stores.length === 0
                    ? "Ingen aktive butikker/lagre funnet."
                    : "Ingen produkter matcher filteret."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
          Soneforklaring
        </h2>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {LOCATION_ZONES.map((z) => (
            <div
              key={z.value}
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "0.625rem 1rem",
                minWidth: "160px",
              }}
            >
              <code style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0f172a" }}>
                {z.value}
              </code>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                {z.label}
              </p>
            </div>
          ))}
        </div>

        <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#64748b", maxWidth: "600px" }}>
          Kodestruktur: <code style={{ background: "#f1f5f9", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>SONE-GANG-REOL-NIVÅ-PLASS</code>
          &nbsp;—&nbsp;f.eks.{" "}
          <code style={{ background: "#f0fdf4", color: "#166534", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>PLUKK-A-01-B-03</code>
          &nbsp;betyr Plukklager, Gang A, Reol 01, Nivå B, Plass 03.
          Nivå telles fra gulvet opp (A = gulvnivå). Plass telles fra venstre.
          Koden er unik per produkt i hvert lager.
        </p>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StoreSelector({
  stores,
  selectedStoreId,
  buildUrl,
}: {
  stores: { id: string; name: string }[];
  selectedStoreId: string;
  buildUrl: (overrides: Record<string, string | undefined>) => string;
}) {
  // Pure server-rendered; switching store uses a link per option
  return (
    <div style={{ display: "flex", gap: "0.375rem" }}>
      {stores.map((s) => (
        <a
          key={s.id}
          href={buildUrl({ storeId: s.id })}
          style={pill(s.id === selectedStoreId)}
        >
          {s.name}
        </a>
      ))}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const filterLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const filterLabelText: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const filterBtnStyle: React.CSSProperties = {
  padding: "0.45rem 0.875rem",
  background: "#f1f5f9",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.875rem",
  color: "#374151",
};

function pill(active: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    fontSize: "0.775rem",
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    background: active ? "#0f172a" : "#f1f5f9",
    color: active ? "#fff" : "#475569",
    border: "1px solid " + (active ? "#0f172a" : "#e2e8f0"),
    whiteSpace: "nowrap" as const,
  };
}
