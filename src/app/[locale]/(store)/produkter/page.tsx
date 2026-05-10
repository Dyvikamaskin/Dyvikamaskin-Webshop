import { listProducts, getActiveBrands } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import {
  ProductListingFilters,
  parseActiveFilters,
} from "@/components/product/ProductListingFilters";
import { getSavedMachinesForFilter } from "@/lib/saved-machines";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Product listing page — /produkter
 *
 * Filter bar (Phase 0.7) reads URL params:
 *   condition=NEW,USED
 *   provenance=GENUINE,OEM,AFTERMARKET
 *   makeId=<MachineMake.id>
 *   modelId=<MachineModel.id>
 *   merke=<brand string>          (legacy chip-row, brand text)
 *   q=<text>                      (search; sok= alias retained)
 *   side=<page>
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseActiveFilters(params);

  const sideRaw = params.side;
  const sideStr = Array.isArray(sideRaw) ? sideRaw[0] : sideRaw;
  const page = Math.max(1, parseInt(sideStr ?? "1", 10) || 1);

  const [
    { products, total, totalPages },
    brands,
    makes,
    modelsForMake,
    savedMachines,
    cookieStore,
  ] = await Promise.all([
    listProducts({
      brand: filters.brand,
      search: filters.search,
      page,
      conditions: filters.conditions,
      provenances: filters.provenances,
      makeId: filters.makeId,
      modelId: filters.modelId,
    }),
    getActiveBrands(),
    prisma.machineMake.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    filters.makeId
      ? prisma.machineModel.findMany({
          where: { makeId: filters.makeId },
          select: { id: true, makeId: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; makeId: string; name: string }[]),
    getSavedMachinesForFilter(),
    cookies(),
  ]);

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
        Produkter
        {total > 0 && (
          <span style={{ fontSize: "1rem", fontWeight: 400, color: "#666", marginLeft: "0.75rem" }}>
            ({total} produkter)
          </span>
        )}
      </h1>

      {/* Search form (carries filters through) */}
      <form
        method="GET"
        style={{ marginBottom: "1.25rem", display: "flex", gap: "0.5rem" }}
      >
        <input
          type="text"
          name="q"
          defaultValue={filters.search ?? ""}
          placeholder="Søk etter produkt, varenr., merke..."
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
          }}
        />
        {/* Preserve other active filters when the user submits a new search */}
        {filters.conditions.length > 0 && (
          <input type="hidden" name="condition" value={filters.conditions.join(",")} />
        )}
        {filters.provenances.length > 0 && (
          <input type="hidden" name="provenance" value={filters.provenances.join(",")} />
        )}
        {filters.makeId && <input type="hidden" name="makeId" value={filters.makeId} />}
        {filters.modelId && <input type="hidden" name="modelId" value={filters.modelId} />}
        {filters.brand && <input type="hidden" name="merke" value={filters.brand} />}
        <button
          type="submit"
          style={{
            padding: "0.5rem 1rem",
            background: "#1d4ed8",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Søk
        </button>
      </form>

      <ProductListingFilters
        basePath="/produkter"
        active={filters}
        makes={makes}
        modelsForMake={modelsForMake}
        savedMachines={savedMachines}
      />

      {/* Brand-text chip row — products' own `brand` field, distinct
          from the MachineMake filter above. Stays for now; will fold
          into the filter bar in a later pass. */}
      {brands.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            fontSize: "0.85rem",
            color: "#374151",
          }}
        >
          <span style={{ fontWeight: 600, color: "#475569" }}>Varemerke:</span>
          {brands.map((b) => {
            const sp = new URLSearchParams();
            if (filters.search) sp.set("q", filters.search);
            if (filters.conditions.length > 0) sp.set("condition", filters.conditions.join(","));
            if (filters.provenances.length > 0) sp.set("provenance", filters.provenances.join(","));
            if (filters.makeId) sp.set("makeId", filters.makeId);
            if (filters.modelId) sp.set("modelId", filters.modelId);
            if (b !== filters.brand) sp.set("merke", b);
            const href = `/produkter${sp.toString() ? `?${sp}` : ""}`;
            const active = filters.brand === b;
            return (
              <a
                key={b}
                href={href}
                style={{
                  padding: "0.2rem 0.7rem",
                  borderRadius: "9999px",
                  border: active ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                  background: active ? "#1d4ed8" : "#fff",
                  color: active ? "#fff" : "#0f172a",
                  textDecoration: "none",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {b}
              </a>
            );
          })}
        </div>
      )}

      {products.length === 0 ? (
        <p style={{ color: "#666" }}>
          {filters.search
            ? `Ingen produkter funnet for "${filters.search}".`
            : "Ingen produkter tilgjengelig."}
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1.25rem",
              marginBottom: "2rem",
            }}
          >
            {products.map((product) => (
              <ProductCard
                key={product.sku}
                product={product}
                customerType={customerType}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const sp = new URLSearchParams();
                if (filters.search) sp.set("q", filters.search);
                if (filters.conditions.length > 0) sp.set("condition", filters.conditions.join(","));
                if (filters.provenances.length > 0) sp.set("provenance", filters.provenances.join(","));
                if (filters.makeId) sp.set("makeId", filters.makeId);
                if (filters.modelId) sp.set("modelId", filters.modelId);
                if (filters.brand) sp.set("merke", filters.brand);
                if (p > 1) sp.set("side", String(p));
                const href = `/produkter${sp.toString() ? `?${sp}` : ""}`;
                return (
                  <a
                    key={p}
                    href={href}
                    style={{
                      padding: "0.375rem 0.75rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "0.375rem",
                      background: p === page ? "#1d4ed8" : "#fff",
                      color: p === page ? "#fff" : "#374151",
                      textDecoration: "none",
                      fontSize: "0.875rem",
                      fontWeight: p === page ? 700 : 400,
                    }}
                  >
                    {p}
                  </a>
                );
              })}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
