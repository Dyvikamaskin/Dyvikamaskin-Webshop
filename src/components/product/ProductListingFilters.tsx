/**
 * ProductListingFilters — Phase 0.7
 *
 * Visible always-on filter bar for /produkter, /kategori/[...slug] and
 * /sok. Filter state is encoded in URL query params so navigation,
 * back-button, and shared links all work.
 *
 * Server component: renders the chip rows from the URL state. Each
 * chip is a plain anchor that navigates to the same page with the
 * relevant param toggled — no client JS needed.
 *
 * URL contract:
 *   condition=NEW                 (or USED, comma-separated for multi)
 *   provenance=GENUINE,OEM        (comma-separated)
 *   makeId=<MachineMake.id>
 *   modelId=<MachineModel.id>     (implies makeId via the model)
 *   merke=<brand string>          (legacy brand filter; phase-out later)
 */

import Link from "next/link";
import {
  ProductCondition,
  PartProvenance,
} from "@/app/generated/prisma/enums";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SavedMachineChip {
  id: string;
  modelId: string;
  makeId: string;
  label: string;
}

export interface FilterMakeOption {
  id: string;
  name: string;
}

export interface FilterModelOption {
  id: string;
  makeId: string;
  name: string;
}

interface FilterBarProps {
  /** The path of the current page (without query). e.g. "/produkter" or
   *  "/kategori/hydraulikk". Used to keep filters scoped to the current
   *  page when toggling chips. */
  basePath: string;

  /** Current URL params parsed into an object. */
  active: ActiveFilters;

  /** All MachineMake options for the brand dropdown. */
  makes: FilterMakeOption[];
  /** Models for the currently selected make (or empty). */
  modelsForMake: FilterModelOption[];

  /** Saved machines for the authenticated user. Empty when guest. */
  savedMachines: SavedMachineChip[];
}

export interface ActiveFilters {
  conditions: ProductCondition[];
  provenances: PartProvenance[];
  makeId?: string;
  modelId?: string;
  /** Legacy: kept so the brand chip-row from Phase 0.6 keeps working. */
  brand?: string;
  /** Free-text search, threaded through. */
  search?: string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const CONDITION_LABEL: Record<ProductCondition, string> = {
  NEW: "Ny",
  USED: "Brukt",
};

const PROVENANCE_LABEL: Record<PartProvenance, string> = {
  GENUINE: "Originaldeler",
  OEM: "OEM",
  AFTERMARKET: "Aftermarket",
};

// ─── URL helpers ─────────────────────────────────────────────────────────────

function buildSearchParams(active: ActiveFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (active.conditions.length > 0) sp.set("condition", active.conditions.join(","));
  if (active.provenances.length > 0) sp.set("provenance", active.provenances.join(","));
  if (active.makeId) sp.set("makeId", active.makeId);
  if (active.modelId) sp.set("modelId", active.modelId);
  if (active.brand) sp.set("merke", active.brand);
  if (active.search) sp.set("q", active.search);
  return sp;
}

function hrefWith(basePath: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function toggleListValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Parse URL searchParams into ActiveFilters. Whitelists enum values
 * defensively so a malformed URL never causes a Prisma type error.
 */
export function parseActiveFilters(
  raw: Record<string, string | string[] | undefined>
): ActiveFilters {
  const get = (key: string): string | undefined => {
    const v = raw[key];
    if (Array.isArray(v)) return v[0];
    return v;
  };
  const conditionParam = get("condition");
  const provenanceParam = get("provenance");
  const conditions: ProductCondition[] = (conditionParam?.split(",") ?? [])
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ProductCondition =>
      s === "NEW" || s === "USED"
    );
  const provenances: PartProvenance[] = (provenanceParam?.split(",") ?? [])
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is PartProvenance =>
      s === "GENUINE" || s === "OEM" || s === "AFTERMARKET"
    );
  return {
    conditions,
    provenances,
    makeId: get("makeId") || undefined,
    modelId: get("modelId") || undefined,
    brand: get("merke") || undefined,
    search: get("q") || get("sok") || undefined,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProductListingFilters({
  basePath,
  active,
  makes,
  modelsForMake,
  savedMachines,
}: FilterBarProps) {
  const hasAny =
    active.conditions.length > 0 ||
    active.provenances.length > 0 ||
    active.makeId ||
    active.modelId ||
    active.brand;

  return (
    <section
      aria-label="Filter"
      style={{
        marginBottom: "1.5rem",
        padding: "1rem 1.1rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        fontSize: "0.85rem",
      }}
    >
      {/* Tilstand */}
      <FilterRow label="Tilstand">
        {(Object.values(ProductCondition) as ProductCondition[]).map((c) => {
          const next = { ...active, conditions: toggleListValue(active.conditions, c) };
          const isActive = active.conditions.includes(c);
          return (
            <Chip
              key={c}
              label={CONDITION_LABEL[c]}
              href={hrefWith(basePath, buildSearchParams(next))}
              active={isActive}
            />
          );
        })}
      </FilterRow>

      {/* Opphav */}
      <FilterRow
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            Opphav
            <Link
              href="/info/deletyper"
              title="Hva betyr Originaldeler / OEM / Aftermarket?"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1rem",
                height: "1rem",
                borderRadius: "50%",
                background: "#e2e8f0",
                color: "#475569",
                fontSize: "0.7rem",
                fontWeight: 700,
                textDecoration: "none",
                fontFamily: "serif",
              }}
            >
              i
            </Link>
          </span>
        }
      >
        {(Object.values(PartProvenance) as PartProvenance[]).map((p) => {
          const next = { ...active, provenances: toggleListValue(active.provenances, p) };
          const isActive = active.provenances.includes(p);
          return (
            <Chip
              key={p}
              label={PROVENANCE_LABEL[p]}
              href={hrefWith(basePath, buildSearchParams(next))}
              active={isActive}
            />
          );
        })}
      </FilterRow>

      {/* Brand + Model */}
      {makes.length > 0 && (
        <FilterRow label="Merke (maskin)">
          <BrandSelect
            basePath={basePath}
            active={active}
            makes={makes}
          />
          {active.makeId && modelsForMake.length > 0 && (
            <ModelSelect
              basePath={basePath}
              active={active}
              models={modelsForMake}
            />
          )}
        </FilterRow>
      )}

      {/* Mine maskiner — only shown when the user has any */}
      {savedMachines.length > 0 && (
        <FilterRow label="Mine maskiner">
          {savedMachines.map((m) => {
            const next: ActiveFilters = {
              ...active,
              makeId: m.makeId,
              modelId: m.modelId,
            };
            const isActive =
              active.makeId === m.makeId && active.modelId === m.modelId;
            return (
              <Chip
                key={m.id}
                label={m.label}
                href={hrefWith(basePath, buildSearchParams(next))}
                active={isActive}
              />
            );
          })}
        </FilterRow>
      )}

      {/* Active-filter summary + Tøm filter */}
      {hasAny && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginTop: "0.85rem",
            paddingTop: "0.85rem",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <span style={{ color: "#475569", fontWeight: 600, marginRight: "0.25rem" }}>
            Aktive filter:
          </span>
          <ActiveSummary active={active} basePath={basePath} makes={makes} modelsForMake={modelsForMake} />
          <Link
            href={
              active.search
                ? hrefWith(
                    basePath,
                    buildSearchParams({
                      conditions: [],
                      provenances: [],
                      search: active.search,
                    })
                  )
                : basePath
            }
            style={{
              marginLeft: "auto",
              padding: "0.2rem 0.7rem",
              borderRadius: "9999px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#0f172a",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.8rem",
            }}
          >
            Tøm filter
          </Link>
        </div>
      )}
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FilterRow({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        flexWrap: "wrap",
        marginBottom: "0.55rem",
      }}
    >
      <span
        style={{
          fontWeight: 600,
          color: "#475569",
          minWidth: "5.5rem",
        }}
      >
        {label}:
      </span>
      {children}
    </div>
  );
}

function Chip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "0.2rem 0.7rem",
        borderRadius: "9999px",
        border: active ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
        background: active ? "#1d4ed8" : "#fff",
        color: active ? "#fff" : "#0f172a",
        textDecoration: "none",
        fontWeight: active ? 600 : 500,
        fontSize: "0.8rem",
      }}
    >
      {label}
    </Link>
  );
}

function BrandSelect({
  basePath,
  active,
  makes,
}: {
  basePath: string;
  active: ActiveFilters;
  makes: FilterMakeOption[];
}) {
  // Render as a static link list-as-chips because we are a server
  // component; full select UX comes when this gets a client wrapper
  // in Phase 5.
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
      {makes.map((m) => {
        const next: ActiveFilters =
          active.makeId === m.id
            ? { ...active, makeId: undefined, modelId: undefined }
            : { ...active, makeId: m.id, modelId: undefined };
        return (
          <Chip
            key={m.id}
            label={m.name}
            href={hrefWith(basePath, buildSearchParams(next))}
            active={active.makeId === m.id}
          />
        );
      })}
    </div>
  );
}

function ModelSelect({
  basePath,
  active,
  models,
}: {
  basePath: string;
  active: ActiveFilters;
  models: FilterModelOption[];
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
      <span style={{ fontSize: "0.8rem", color: "#64748b", alignSelf: "center" }}>
        Modell:
      </span>
      {models.map((mod) => {
        const next: ActiveFilters =
          active.modelId === mod.id
            ? { ...active, modelId: undefined }
            : { ...active, modelId: mod.id };
        return (
          <Chip
            key={mod.id}
            label={mod.name}
            href={hrefWith(basePath, buildSearchParams(next))}
            active={active.modelId === mod.id}
          />
        );
      })}
    </div>
  );
}

function ActiveSummary({
  active,
  basePath,
  makes,
  modelsForMake,
}: {
  active: ActiveFilters;
  basePath: string;
  makes: FilterMakeOption[];
  modelsForMake: FilterModelOption[];
}) {
  const chips: { key: string; label: string; clearedHref: string }[] = [];

  for (const c of active.conditions) {
    const next = { ...active, conditions: active.conditions.filter((x) => x !== c) };
    chips.push({
      key: `c-${c}`,
      label: CONDITION_LABEL[c],
      clearedHref: hrefWith(basePath, buildSearchParams(next)),
    });
  }
  for (const p of active.provenances) {
    const next = { ...active, provenances: active.provenances.filter((x) => x !== p) };
    chips.push({
      key: `p-${p}`,
      label: PROVENANCE_LABEL[p],
      clearedHref: hrefWith(basePath, buildSearchParams(next)),
    });
  }
  if (active.makeId) {
    const make = makes.find((m) => m.id === active.makeId);
    const next = { ...active, makeId: undefined, modelId: undefined };
    chips.push({
      key: `make-${active.makeId}`,
      label: make ? `Merke: ${make.name}` : "Merke",
      clearedHref: hrefWith(basePath, buildSearchParams(next)),
    });
  }
  if (active.modelId) {
    const model = modelsForMake.find((m) => m.id === active.modelId);
    const next = { ...active, modelId: undefined };
    chips.push({
      key: `model-${active.modelId}`,
      label: model ? `Modell: ${model.name}` : "Modell",
      clearedHref: hrefWith(basePath, buildSearchParams(next)),
    });
  }
  if (active.brand) {
    const next = { ...active, brand: undefined };
    chips.push({
      key: `brand-${active.brand}`,
      label: `Merke (vare): ${active.brand}`,
      clearedHref: hrefWith(basePath, buildSearchParams(next)),
    });
  }

  return (
    <>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.clearedHref}
          style={{
            padding: "0.15rem 0.65rem",
            borderRadius: "9999px",
            background: "#0f172a",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "0.8rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {c.label}
          <span aria-hidden style={{ fontSize: "0.7rem", opacity: 0.8 }}>✕</span>
        </Link>
      ))}
    </>
  );
}
