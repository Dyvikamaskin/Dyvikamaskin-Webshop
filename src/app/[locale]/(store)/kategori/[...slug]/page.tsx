import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { resolveCategoryPath } from "@/lib/categories";
import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import {
  ProductListingFilters,
  parseActiveFilters,
} from "@/components/product/ProductListingFilters";
import { getSavedMachinesForFilter } from "@/lib/saved-machines";
import { prisma } from "@/lib/prisma";
import type { CustomerTypeValue } from "@/lib/stores/use-customer-type";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string[]; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await resolveCategoryPath(slug);

  if (!category) return { title: "Kategori ikke funnet" };

  return {
    title: `${category.name} — Dyvikamaskin`,
    description: `Se alle produkter i kategorien ${category.name}`,
  };
}

/**
 * Category page — /kategori/[...slug]
 * Shares the Phase 0.7 filter bar with /produkter and /sok.
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const filters = parseActiveFilters(sp);

  const sideRaw = sp.side;
  const sideStr = Array.isArray(sideRaw) ? sideRaw[0] : sideRaw;
  const page = Math.max(1, parseInt(sideStr ?? "1", 10) || 1);

  const [category, makes, savedMachines, cookieStore] = await Promise.all([
    resolveCategoryPath(slug),
    prisma.machineMake.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getSavedMachinesForFilter(),
    cookies(),
  ]);

  if (!category) notFound();

  const [{ products, total, totalPages }, modelsForMake] = await Promise.all([
    listProducts({
      categoryId: category.id,
      brand: filters.brand,
      page,
      conditions: filters.conditions,
      provenances: filters.provenances,
      makeId: filters.makeId,
      modelId: filters.modelId,
    }),
    filters.makeId
      ? prisma.machineModel.findMany({
          where: { makeId: filters.makeId },
          select: { id: true, makeId: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; makeId: string; name: string }[]),
  ]);

  const rawType = cookieStore.get("customer-type")?.value;
  const customerType: CustomerTypeValue =
    rawType === "BUSINESS" ? "BUSINESS" : "CONSUMER";

  const basePath = `/kategori/${slug.join("/")}`;

  return (
    <main
      style={{
        padding: "1.5rem",
        fontFamily: "sans-serif",
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        {category.name}
      </h1>
      {total > 0 && (
        <p style={{ color: "#666", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {total} produkt{total !== 1 ? "er" : ""}
        </p>
      )}

      <ProductListingFilters
        basePath={basePath}
        active={filters}
        makes={makes}
        modelsForMake={modelsForMake}
        savedMachines={savedMachines}
      />

      {products.length === 0 ? (
        <p style={{ color: "#666" }}>Ingen produkter i denne kategorien.</p>
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
                const qp = new URLSearchParams();
                if (filters.conditions.length > 0) qp.set("condition", filters.conditions.join(","));
                if (filters.provenances.length > 0) qp.set("provenance", filters.provenances.join(","));
                if (filters.makeId) qp.set("makeId", filters.makeId);
                if (filters.modelId) qp.set("modelId", filters.modelId);
                if (filters.brand) qp.set("merke", filters.brand);
                if (p > 1) qp.set("side", String(p));
                const href = `${basePath}${qp.toString() ? `?${qp}` : ""}`;
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
