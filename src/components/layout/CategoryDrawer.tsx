"use client";

/**
 * CategoryDrawer — Phase 0.5
 *
 * Slide-out left drawer with two-tier root and multi-pane drilldown.
 *
 * Reference: tools.no's hamburger drawer (see
 * docs/v4.1-implementation-plan.md Phase 0.5).
 *
 * Root pane:
 *   - Bold primary tier: PRODUKTER, MASKINER, KAMPANJER, VÅRE TJENESTER.
 *     Items with submenus show a right chevron and push a sub-pane.
 *   - Visual divider.
 *   - Smaller secondary tier: Kundeservice, Om oss, Finn lager, etc.
 *
 * Sub-panes:
 *   - Header has a back chevron labelled with the parent's name plus the X
 *     close button. Each sub-pane scrolls independently.
 *   - VIS ALT button (top-right of pane) routes to the parent's full
 *     listing without picking a leaf.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryNode } from "@/lib/categories";
import { useDrawerStore } from "@/lib/stores/use-drawer";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "@/components/layout/icons";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export interface MachineMakeNode {
  id: string;
  name: string;
  slug: string;
  modelCount: number;
}

interface CategoryDrawerProps {
  categoryTree: CategoryNode[];
  machineMakes: MachineMakeNode[];
}

// Pane state — a stack. Each item is one level of drilldown.
type Pane =
  | { kind: "categories"; nodes: CategoryNode[]; title: string; backHref?: string }
  | { kind: "machines";   makes: MachineMakeNode[]; title: string }
  | { kind: "services" };

// Static service links (Phase 0.5 stub — links go to placeholder pages
// already documented in route-stub-registry.md).
const SERVICE_ITEMS: { label: string; href: string }[] = [
  { label: "Bedriftskunde",      href: "/info/bedriftskunde" },
  { label: "Be om tilbud",       href: "/info/tilbud" },
  { label: "Levering & retur",   href: "/info/levering-og-retur" },
  { label: "Reklamasjon",        href: "/info/reklamasjon" },
];

const SECONDARY_ITEMS: { label: string; href: string }[] = [
  { label: "Kundeservice",   href: "/info/kundeservice" },
  { label: "Om oss",         href: "/info/om-oss" },
  { label: "Finn lager",     href: "/info/finn-lager" },
  { label: "Kunnskapsbase",  href: "/info/kunnskapsbase" },
  { label: "Tips og råd",    href: "/info/tips-og-rad" },
  { label: "Nyheter",        href: "/info/nyheter" },
  { label: "Kontakt oss",    href: "/info/kontakt" },
];

// ─── Component ────────────────────────────────────────────────────────────

export default function CategoryDrawer({
  categoryTree,
  machineMakes,
}: CategoryDrawerProps) {
  const isOpen = useDrawerStore((s) => s.isOpen);
  const close = useDrawerStore((s) => s.close);
  const pathname = usePathname();

  // Pane stack drives the multi-pane drilldown.
  const [stack, setStack] = useState<Pane[]>([]);

  // Close on route change.
  useEffect(() => {
    if (isOpen) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Reset stack whenever the drawer reopens so drilldown does not
  // persist between sessions.
  useEffect(() => {
    if (isOpen) setStack([]);
  }, [isOpen]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function pushCategoryPane(nodes: CategoryNode[], title: string, backHref?: string) {
    setStack((s) => [...s, { kind: "categories", nodes, title, backHref }]);
  }

  function pushMachinesPane() {
    setStack((s) => [...s, { kind: "machines", makes: machineMakes, title: "Maskiner" }]);
  }

  function pushServicesPane() {
    setStack((s) => [...s, { kind: "services" }]);
  }

  function popPane() {
    setStack((s) => s.slice(0, -1));
  }

  const topPane: Pane | null = stack[stack.length - 1] ?? null;
  const parentLabel = stack.length === 0
    ? "MENY"
    : stack.length === 1
    ? "MENY"
    : paneTitle(stack[stack.length - 2]);

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Lukk meny"
        onClick={close}
        className="absolute inset-0 bg-black/40"
      />

      {/* Drawer */}
      <aside
        className="relative ml-0 flex h-full w-full max-w-[360px] flex-col bg-white shadow-xl"
      >
        {topPane === null ? (
          <RootPane
            onPickProducts={() =>
              pushCategoryPane(categoryTree, "Produkter", "/produkter")
            }
            onPickMachines={pushMachinesPane}
            onPickServices={pushServicesPane}
            onClose={close}
          />
        ) : (
          <SubPane
            pane={topPane}
            parentLabel={parentLabel}
            onBack={popPane}
            onClose={close}
            onDrill={pushCategoryPane}
          />
        )}
      </aside>
    </div>
  );
}

// ─── Root pane ────────────────────────────────────────────────────────────

function RootPane({
  onPickProducts,
  onPickMachines,
  onPickServices,
  onClose,
}: {
  onPickProducts: () => void;
  onPickMachines: () => void;
  onPickServices: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <PaneHeader title="MENY" onClose={onClose} />

      {/* Primary tier */}
      <ul className="px-4 py-3">
        <DrilldownItem label="PRODUKTER" onClick={onPickProducts} />
        <DrilldownItem label="MASKINER" onClick={onPickMachines} />
        <FlatLinkItem label="KAMPANJER" href="/kampanjer" emphasize />
        <DrilldownItem label="VÅRE TJENESTER" onClick={onPickServices} />
      </ul>

      <hr className="mx-4 border-slate-200" />

      {/* Secondary tier */}
      <ul className="px-4 py-3 overflow-y-auto">
        {SECONDARY_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block py-2 text-sm text-slate-700 hover:text-slate-900"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// ─── Sub-pane ─────────────────────────────────────────────────────────────

function SubPane({
  pane,
  parentLabel,
  onBack,
  onClose,
  onDrill,
}: {
  pane: Pane;
  parentLabel: string;
  onBack: () => void;
  onClose: () => void;
  onDrill: (nodes: CategoryNode[], title: string, backHref?: string) => void;
}) {
  return (
    <>
      <PaneHeader
        title={paneTitle(pane).toUpperCase()}
        onClose={onClose}
        backLabel={parentLabel.toUpperCase()}
        onBack={onBack}
        visAltHref={paneVisAltHref(pane)}
      />

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {pane.kind === "categories" && (
          <CategoryList
            nodes={pane.nodes}
            onDrill={(node) =>
              onDrill(
                node.children,
                node.name,
                `/kategori/${node.slug}`
              )
            }
          />
        )}

        {pane.kind === "machines" && <MachineMakeList makes={pane.makes} />}

        {pane.kind === "services" && <ServiceList />}
      </div>
    </>
  );
}

// ─── Pane header ──────────────────────────────────────────────────────────

function PaneHeader({
  title,
  onClose,
  backLabel,
  onBack,
  visAltHref,
}: {
  title: string;
  onClose: () => void;
  backLabel?: string;
  onBack?: () => void;
  visAltHref?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold tracking-wide text-slate-700 hover:text-slate-900"
        >
          <ChevronLeftIcon className="text-base" />
          {backLabel}
        </button>
      ) : (
        <span className="text-base font-bold tracking-wide text-slate-900">
          {title}
        </span>
      )}

      <div className="flex items-center gap-2">
        {visAltHref ? (
          <Link
            href={visAltHref}
            className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            VIS ALT
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Lukk meny"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <CloseIcon className="text-xl" />
        </button>
      </div>
    </header>
  );
}

// ─── Inner lists ──────────────────────────────────────────────────────────

function DrilldownItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-base font-bold tracking-wide text-slate-900 hover:text-blue-700"
      >
        <span>{label}</span>
        <ChevronRightIcon className="text-base text-slate-500" />
      </button>
    </li>
  );
}

function FlatLinkItem({
  label,
  href,
  emphasize,
}: {
  label: string;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={
          "block py-3 " +
          (emphasize
            ? "text-base font-bold tracking-wide text-slate-900 hover:text-blue-700"
            : "text-sm text-slate-700 hover:text-slate-900")
        }
      >
        {label}
      </Link>
    </li>
  );
}

function CategoryList({
  nodes,
  onDrill,
}: {
  nodes: CategoryNode[];
  onDrill: (node: CategoryNode) => void;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Ingen kategorier registrert ennå.
      </p>
    );
  }

  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id} className="border-b border-slate-100 last:border-b-0">
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => onDrill(node)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-slate-800 hover:text-blue-700"
            >
              <span>{node.name}</span>
              <ChevronRightIcon className="text-base text-slate-400" />
            </button>
          ) : (
            <Link
              href={`/kategori/${node.slug}`}
              className="block py-3 text-sm text-slate-800 hover:text-blue-700"
            >
              {node.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function MachineMakeList({ makes }: { makes: MachineMakeNode[] }) {
  if (makes.length === 0) {
    return <p className="text-sm text-slate-500">Ingen merker registrert.</p>;
  }
  return (
    <ul>
      {makes.map((make) => (
        <li key={make.id} className="border-b border-slate-100 last:border-b-0">
          <Link
            href={`/maskiner/${make.slug}`}
            className="flex w-full items-center justify-between gap-3 py-3 text-sm text-slate-800 hover:text-blue-700"
          >
            <span>{make.name}</span>
            <span className="text-xs text-slate-400">{make.modelCount}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ServiceList() {
  return (
    <ul>
      {SERVICE_ITEMS.map((item) => (
        <li key={item.href} className="border-b border-slate-100 last:border-b-0">
          <Link
            href={item.href}
            className="block py-3 text-sm text-slate-800 hover:text-blue-700"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function paneTitle(pane: Pane | undefined): string {
  if (!pane) return "MENY";
  if (pane.kind === "categories") return pane.title;
  if (pane.kind === "machines") return pane.title;
  return "Våre tjenester";
}

function paneVisAltHref(pane: Pane): string | undefined {
  if (pane.kind === "categories") return pane.backHref;
  if (pane.kind === "machines") return "/maskiner";
  return undefined;
}
