import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import {
  ProductListingFilters,
  parseActiveFilters,
} from "@/components/product/ProductListingFilters";
import { getSavedMachinesForFilter } from "@/lib/saved-machines";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";
import type { Metadata } from "next";

/**
 * Search results — /sok
 *
 * URL contract: same params as /produkter (q, condition, provenance,
 * makeId, modelId, merke, side). Filter bar shared with /produkter.
 *
 * Phase 5 will swap the backend for pg_trgm + FTS without changing
 * this contract.
 */

export const metadata: Metadata = {
  title: "Søk — Dyvikamaskin",
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const filters = parseActiveFilters(params);
  const query = filters.search ?? "";

  const sideRaw = params.side ?? params.page;
  const sideStr = Array.isArray(sideRaw) ? sideRaw[0] : sideRaw;
  const page = Math.max(1, parseInt(sideStr ?? "1", 10) || 1);

  const [makes, modelsForMake, savedMachines, cookieStore] = await Promise.all([
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

  const result = query
    ? await listProducts({
        search: query,
        page,
        limit: 24,
        conditions: filters.conditions,
        provenances: filters.provenances,
        makeId: filters.makeId,
        modelId: filters.modelId,
        brand: filters.brand,
      })
    : null;

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
          Søk
        </h1>
        {query ? (
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.95rem" }}>
            {result?.total ?? 0} treff for «{query}»
          </p>
        ) : (
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.95rem" }}>
            Skriv inn et søk i søkefeltet øverst.
          </p>
        )}
      </header>

      {query ? (
        <ProductListingFilters
          basePath="/sok"
          active={filters}
          makes={makes}
          modelsForMake={modelsForMake}
          savedMachines={savedMachines}
        />
      ) : null}

      {result && result.products.length > 0 ? (
        <section>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {result.products.map((product) => (
              <ProductCard
                key={product.sku}
                product={product}
                customerType={customerType}
              />
            ))}
          </div>

          {result.totalPages > 1 ? (
            <nav
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                marginTop: "2rem",
                fontSize: "0.875rem",
              }}
            >
              {Array.from({ length: result.totalPages }, (_, i) => i + 1).map(
                (n) => {
                  const sp = new URLSearchParams();
                  sp.set("q", query);
                  if (filters.conditions.length > 0) sp.set("condition", filters.conditions.join(","));
                  if (filters.provenances.length > 0) sp.set("provenance", filters.provenances.join(","));
                  if (filters.makeId) sp.set("makeId", filters.makeId);
                  if (filters.modelId) sp.set("modelId", filters.modelId);
                  if (filters.brand) sp.set("merke", filters.brand);
                  if (n > 1) sp.set("side", String(n));
                  return (
                    <a
                      key={n}
                      href={`/sok?${sp}`}
                      style={{
                        padding: "0.4rem 0.7rem",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        background: n === page ? "#0f172a" : "#fff",
                        color: n === page ? "#fff" : "#0f172a",
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      {n}
                    </a>
                  );
                }
              )}
            </nav>
          ) : null}
        </section>
      ) : query ? (
        <p style={{ color: "#64748b" }}>Ingen treff. Prøv et annet søkeord.</p>
      ) : null}
    </main>
  );
}
