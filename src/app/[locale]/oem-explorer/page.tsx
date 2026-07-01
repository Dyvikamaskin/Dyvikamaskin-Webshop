"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MachineVariant = {
  id: string;
  code: string;
  displayName: string;
  modelName: string;
  isDiscontinued: boolean;
  diagramCount: number;
  revisionCount: number;
};

type ModelGroup = {
  displayName: string;
  variants: MachineVariant[];
};

type SubCategory = {
  name: string;
  models: ModelGroup[];
};

type TopGroup = {
  name: string;
  subCategories: SubCategory[];
};

type MachineResult = {
  id: string;
  code: string;
  displayName: string;
  modelName: string;
  categoryPath: string[] | null;
  isDiscontinued: boolean;
  _count: { revisions: number };
};

type OperatingManual = {
  url: string;
  filename: string;
  size: number;
  languages: { name: string; isocode: string }[];
};

type Revision = {
  id: string;
  revisionTag: string;
  rawName: string | null;
  hasBom: boolean;
  sparePartListCode: string | null;
  partsManualUrl: string | null;
  partsManualFilename: string | null;
  serialFrom: string | null;
  serialTo: string | null;
  operatingManuals: OperatingManual[] | null;
  _count: { diagrams: number };
};

type MachineDetail = MachineResult & { revisions: Revision[] };

type Diagram = {
  id: string;
  name: string;
  position: number | null;
  diagramImageKey: string | null;
  componentCode: string | null;
  _count: { lines: number };
};

type PartLine = {
  callout: string;
  qty: number | null;
  notes: string | null;
  part: {
    partNumber: string;
    name: string;
    unitOfMeasure: string | null;
    isRecommended: boolean;
  };
};

type Hotspot = { id: number; x1: number; y1: number; x2: number; y2: number };
type HotspotsData = { hotspots: Hotspot[]; globalx: number; globaly: number };

// ── Diagram Viewer ────────────────────────────────────────────────────────────

function DiagramViewer({
  diagram,
  parts,
  loadingParts,
}: {
  diagram: Diagram;
  parts: PartLine[];
  loadingParts: boolean;
}) {
  const [hotspotsData, setHotspotsData] = useState<HotspotsData | null>(null);
  const [activeCallouts, setActiveCallouts] = useState<Set<number>>(new Set());
  const [hoveredCallout, setHoveredCallout] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHotspotsData(null);
    setActiveCallouts(new Set());
    setHoveredCallout(null);
    fetch(`/api/oem/diagram/${diagram.id}/hotspots`)
      .then((r) => r.json())
      .then(setHotspotsData)
      .catch(() => {});
  }, [diagram.id]);

  const toggleCallout = (calloutId: number) => {
    setActiveCallouts((prev) => {
      const next = new Set(prev);
      if (next.has(calloutId)) {
        next.delete(calloutId);
      } else {
        next.add(calloutId);
        rowRefs.current.get(String(calloutId))?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return next;
    });
  };

  const isLit = (id: number) => activeCallouts.has(id) || hoveredCallout === id;
  const { hotspots = [], globalx = 1000, globaly = 1000 } = hotspotsData ?? {};

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex-1 min-w-0 overflow-auto bg-white border-r border-gray-100 flex items-start justify-center p-3">
        {diagram.diagramImageKey ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/oem/image/${diagram.diagramImageKey}`}
              alt={diagram.name}
              className="block max-w-full h-auto"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
            {hotspots.length > 0 && (
              <svg
                viewBox={`0 0 ${globalx} ${globaly}`}
                className="absolute inset-0 w-full h-full overflow-visible"
                style={{ cursor: "default" }}
              >
                {hotspots.map((h, i) => {
                  const cx = (h.x1 + h.x2) / 2;
                  const cy = (h.y1 + h.y2) / 2;
                  const w = h.x2 - h.x1;
                  const hh = h.y2 - h.y1;
                  const active = activeCallouts.has(h.id);
                  const lit = isLit(h.id);
                  const boxFill = active ? "#e65c00" : lit ? "#f97316" : "#fff";
                  const boxStroke = lit ? "#e65c00" : "#b45309";
                  const textFill = lit ? "#fff" : "#78350f";
                  const fontSize = Math.max(18, Math.min(w, hh) * 0.55);
                  return (
                    <g
                      key={`${h.id}-${i}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleCallout(h.id)}
                      onMouseEnter={() => setHoveredCallout(h.id)}
                      onMouseLeave={() => setHoveredCallout(null)}
                    >
                      <rect x={h.x1} y={h.y1} width={w} height={hh} fill="transparent" stroke="none" />
                      <rect
                        x={cx - fontSize * 0.75} y={cy - fontSize * 0.6}
                        width={fontSize * 1.5} height={fontSize * 1.2} rx={3}
                        fill={boxFill} stroke={boxStroke} strokeWidth={lit ? 3 : 1.5}
                        style={{ transition: "fill 0.1s, stroke 0.1s" }}
                      />
                      <text
                        x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                        fontSize={fontSize} fontWeight="600" fontFamily="sans-serif" fill={textFill}
                        style={{ transition: "fill 0.1s", userSelect: "none", pointerEvents: "none" }}
                      >
                        {h.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center w-full h-48 text-sm text-gray-400">No image</div>
        )}
      </div>
      <div ref={tableRef} className="w-[420px] shrink-0 overflow-y-auto">
        {loadingParts ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading parts…</p>
        ) : parts.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No parts listed</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 text-xs uppercase text-gray-500 tracking-wide z-10">
              <tr>
                <th className="text-center px-3 py-2 w-10 border-b border-gray-200">Pos.</th>
                <th className="text-left px-3 py-2 w-28 border-b border-gray-200">Part no.</th>
                <th className="text-left px-3 py-2 border-b border-gray-200">Description</th>
                <th className="text-center px-3 py-2 w-10 border-b border-gray-200">Qty</th>
                <th className="text-left px-3 py-2 w-10 border-b border-gray-200">Unit</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((l, i) => {
                const calloutNum = Number(l.callout);
                const active = activeCallouts.has(calloutNum);
                const lit = isLit(calloutNum);
                return (
                  <tr
                    key={`${i}-${l.callout}-${l.part.partNumber}`}
                    ref={(el) => { if (el) rowRefs.current.set(l.callout, el); }}
                    className="cursor-pointer border-b border-gray-100 transition-colors"
                    style={{
                      backgroundColor: active ? "#fed7aa" : lit ? "#ffedd5" : l.part.isRecommended ? "#fef9c3" : "transparent",
                    }}
                    onClick={() => toggleCallout(calloutNum)}
                    onMouseEnter={() => setHoveredCallout(calloutNum)}
                    onMouseLeave={() => setHoveredCallout(null)}
                  >
                    <td className="px-3 py-1.5 text-center font-mono text-xs font-bold text-gray-600">{l.callout}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{l.part.partNumber}</td>
                    <td className="px-3 py-1.5 text-gray-800">{l.part.name}</td>
                    <td className="px-3 py-1.5 text-center text-gray-600">{l.qty ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-400 text-xs">{l.part.unitOfMeasure ?? "PC"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Category Tree Sidebar ─────────────────────────────────────────────────────

function CategorySidebar({
  topGroups,
  selectedMachineCode,
  onSelect,
}: {
  topGroups: TopGroup[];
  selectedMachineCode: string | null;
  onSelect: (m: MachineVariant) => void;
}) {
  const [openTop, setOpenTop] = useState<Set<string>>(new Set());
  const [openSub, setOpenSub] = useState<Set<string>>(new Set());
  const [openModels, setOpenModels] = useState<Set<string>>(new Set());

  // Auto-open path to selected machine
  useEffect(() => {
    if (!selectedMachineCode) return;
    for (const top of topGroups) {
      for (const sub of top.subCategories) {
        for (const model of sub.models) {
          if (model.variants.some((v) => v.code === selectedMachineCode)) {
            setOpenTop((prev) => new Set(prev).add(top.name));
            setOpenSub((prev) => new Set(prev).add(`${top.name}:${sub.name}`));
            if (model.variants.length > 1)
              setOpenModels((prev) => new Set(prev).add(`${top.name}:${sub.name}:${model.displayName}`));
            return;
          }
        }
      }
    }
  }, [selectedMachineCode, topGroups]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {topGroups.map((top) => {
        const topOpen = openTop.has(top.name);
        const totalModels = top.subCategories.reduce((s, c) => s + c.models.length, 0);
        return (
          <div key={top.name}>
            {/* Top group */}
            <button
              onClick={() => toggle(openTop, top.name, setOpenTop)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide bg-gray-100 hover:bg-gray-200 border-b border-gray-200 cursor-pointer"
            >
              <span className="truncate">{top.name}</span>
              <span className="ml-2 shrink-0 text-gray-500">{topOpen ? "▾" : "▸"} {totalModels}</span>
            </button>

            {topOpen && top.subCategories.map((sub) => {
              const subKey = `${top.name}:${sub.name}`;
              const subOpen = openSub.has(subKey);
              const subHasSelected = sub.models.some((m) => m.variants.some((v) => v.code === selectedMachineCode));

              return (
                <div key={subKey}>
                  {/* Sub-category header */}
                  <button
                    onClick={() => toggle(openSub, subKey, setOpenSub)}
                    className={`w-full flex items-center justify-between pl-4 pr-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 border-b border-gray-100 cursor-pointer ${subHasSelected ? "border-l-2 border-l-blue-300" : ""}`}
                  >
                    <span className="truncate">{sub.name === top.name ? "General" : sub.name}</span>
                    <span className="ml-2 shrink-0 text-gray-400">{subOpen ? "▾" : "▸"} {sub.models.length}</span>
                  </button>

                  {subOpen && sub.models.map((model) => {
                    const modelKey = `${subKey}:${model.displayName}`;
                    const multiVariant = model.variants.length > 1;
                    const modelOpen = openModels.has(modelKey);
                    const isSelected = model.variants.some((v) => v.code === selectedMachineCode);
                    const indent = "pl-7";

                    return (
                      <div key={modelKey}>
                        {multiVariant ? (
                          <>
                            <button
                              onClick={() => toggle(openModels, modelKey, setOpenModels)}
                              className={`w-full flex items-center justify-between ${indent} pr-3 py-2 text-left border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? "border-l-4 border-l-blue-400" : ""}`}
                            >
                              <span className={`text-sm font-medium ${model.variants[0].isDiscontinued ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                {model.displayName}
                              </span>
                              <span className="ml-2 shrink-0 text-xs text-gray-400">{modelOpen ? "▾" : "▸"} {model.variants.length}</span>
                            </button>
                            {modelOpen && model.variants.map((v) => (
                              <button
                                key={v.id}
                                onClick={() => onSelect(v)}
                                className={`w-full text-left pl-10 pr-3 py-1.5 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${selectedMachineCode === v.code ? "bg-blue-50 border-l-4 border-l-blue-500" : ""}`}
                              >
                                <p className="text-xs text-gray-600 font-mono">{v.code}</p>
                              </button>
                            ))}
                          </>
                        ) : (
                          <button
                            onClick={() => onSelect(model.variants[0])}
                            className={`w-full text-left ${indent} pr-3 py-2 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${selectedMachineCode === model.variants[0].code ? "bg-blue-50 border-l-4 border-l-blue-500" : ""}`}
                          >
                            <p className={`text-sm font-medium ${model.variants[0].isDiscontinued ? "text-gray-400 line-through" : "text-gray-800"}`}>
                              {model.displayName}
                            </p>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Search Dropdown ───────────────────────────────────────────────────────────

function SearchDropdown({
  onSelect,
}: {
  onSelect: (m: MachineResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MachineResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/oem/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => { setResults(data); setOpen(true); setSearching(false); })
        .catch(() => setSearching(false));
    }, 300);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (m: MachineResult) => {
    setQuery("");
    setOpen(false);
    setResults([]);
    onSelect(m);
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      <input
        type="search"
        placeholder="Search machines — e.g. BS50, DPU2540, EZ17, RD24"
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
      />
      {searching && (
        <span className="absolute right-3 top-2.5 text-gray-400 text-xs animate-pulse">…</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {results.length === 0 && query.length >= 2 && !searching && (
            <p className="px-4 py-3 text-sm text-gray-400">No results for "{query}"</p>
          )}
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 cursor-pointer transition-colors"
            >
              <p className={`text-sm font-medium ${m.isDiscontinued ? "text-gray-400 line-through" : "text-gray-800"}`}>
                {m.displayName}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {m.categoryPath?.join(" › ")} · <span className="font-mono">{m.code}</span>
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OemExplorer() {
  const [topGroups, setTopGroups] = useState<TopGroup[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<MachineDetail | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [loadingDiagrams, setLoadingDiagrams] = useState(false);
  const [selectedDiagram, setSelectedDiagram] = useState<Diagram | null>(null);
  const [parts, setParts] = useState<PartLine[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  const detailPanelRef = useRef<HTMLDivElement>(null);
  const pendingDiagramId = useRef<string | null>(null);

  // Load category tree
  useEffect(() => {
    fetch("/api/oem/categories")
      .then((r) => r.json())
      .then(setTopGroups)
      .catch(() => {});
  }, []);

  const selectMachine = useCallback(async (m: { code: string }) => {
    setSelectedDiagram(null);
    setDiagrams([]);
    setSelectedRevisionId(null);
    setParts([]);
    const data: MachineDetail = await fetch(`/api/oem/machine/${m.code}`).then((r) => r.json());
    setSelectedMachine(data);
    const first = data.revisions.find((r) => r._count.diagrams > 0) ?? data.revisions[0];
    if (first) setSelectedRevisionId(first.id);
    window.history.replaceState(null, "", `?machine=${encodeURIComponent(m.code)}`);
  }, []);

  // Boot: restore from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const machineCode = params.get("machine");
    const diagramId = params.get("diagram");

    if (diagramId) {
      pendingDiagramId.current = diagramId;
      fetch(`/api/oem/diagram/${diagramId}`)
        .then((r) => r.json())
        .then((meta: { machineCode: string; revisionId: string }) => {
          return fetch(`/api/oem/machine/${meta.machineCode}`)
            .then((r) => r.json())
            .then((data: MachineDetail) => {
              setSelectedMachine(data);
              setSelectedRevisionId(meta.revisionId);
            });
        })
        .catch(() => {});
      return;
    }

    if (machineCode) {
      fetch(`/api/oem/machine/${machineCode}`)
        .then((r) => r.json())
        .then((data: MachineDetail) => {
          setSelectedMachine(data);
          const first = data.revisions.find((r) => r._count.diagrams > 0) ?? data.revisions[0];
          if (first) setSelectedRevisionId(first.id);
        })
        .catch(() => {});
    }
  }, []);

  const selectDiagram = useCallback((d: Diagram) => {
    setSelectedDiagram(d);
    setLoadingParts(true);
    setParts([]);
    fetch(`/api/oem/diagram/${d.id}/parts`)
      .then((r) => r.json())
      .then((data) => { setParts(data); setLoadingParts(false); })
      .catch(() => setLoadingParts(false));
    const current = new URLSearchParams(window.location.search);
    current.set("diagram", d.id);
    window.history.replaceState(null, "", `?${current.toString()}`);
    setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  useEffect(() => {
    if (!selectedRevisionId) return;
    setLoadingDiagrams(true);
    setSelectedDiagram(null);
    setParts([]);
    fetch(`/api/oem/revision/${selectedRevisionId}/diagrams`)
      .then((r) => r.json())
      .then((data: Diagram[]) => {
        setDiagrams(data);
        setLoadingDiagrams(false);
        if (pendingDiagramId.current) {
          const target = data.find((d) => d.id === pendingDiagramId.current);
          pendingDiagramId.current = null;
          if (target) selectDiagram(target);
        }
      })
      .catch(() => setLoadingDiagrams(false));
  }, [selectedRevisionId, selectDiagram]);

  const selectedRevision = selectedMachine?.revisions.find((r) => r.id === selectedRevisionId);

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="font-semibold text-gray-800 text-sm whitespace-nowrap">OEM Parts Explorer</span>
        <SearchDropdown onSelect={selectMachine} />
        <span className="text-xs text-gray-400 whitespace-nowrap">4,412 machines · 422K diagrams · 7.6M part lines</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — category tree */}
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-white overflow-hidden flex flex-col">
          {topGroups.length === 0 ? (
            <p className="p-4 text-xs text-gray-400 text-center">Loading categories…</p>
          ) : (
            <CategorySidebar
              topGroups={topGroups}
              selectedMachineCode={selectedMachine?.code ?? null}
              onSelect={(v) => selectMachine({ code: v.code })}
            />
          )}
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-y-auto">
          {!selectedMachine ? (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">
              Select a machine from the list or search above
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Machine header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
                <h1 className="text-lg font-semibold text-gray-900">{selectedMachine.displayName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedMachine.categoryPath?.join(" › ")} · Model Number: {selectedMachine.code}
                </p>
              </div>

              {/* Revision tabs */}
              {selectedMachine.revisions.length > 0 && (
                <div className="flex gap-1 px-6 py-2 bg-white border-b border-gray-200 overflow-x-auto sticky top-[73px] z-10">
                  {selectedMachine.revisions.map((rev) => (
                    <button
                      key={rev.id}
                      onClick={() => setSelectedRevisionId(rev.id)}
                      className={`cursor-pointer px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                        selectedRevisionId === rev.id
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      } ${rev._count.diagrams === 0 ? "opacity-40" : ""}`}
                    >
                      {rev.rawName ?? rev.revisionTag}
                      <span className="ml-1 opacity-60">({rev._count.diagrams})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Revision info bar */}
              {selectedRevision && (
                <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                  <span><span className="text-gray-400">Model no.:</span> {selectedMachine.code}</span>
                  {selectedRevision.sparePartListCode && (
                    <span><span className="text-gray-400">Parts manual no.:</span> {selectedRevision.sparePartListCode}</span>
                  )}
                  {selectedRevision.serialFrom && (
                    <span>
                      <span className="text-gray-400">Serial:</span>{" "}
                      {selectedRevision.serialFrom} → {selectedRevision.serialTo ?? "…"}
                    </span>
                  )}
                  {selectedRevision.partsManualUrl && (
                    <a
                      href={`https://shop.wackerneuson.com${selectedRevision.partsManualUrl}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      ↓ Parts manual PDF
                    </a>
                  )}
                  {selectedRevision.operatingManuals && selectedRevision.operatingManuals.length > 0 && (
                    <details className="cursor-pointer">
                      <summary className="text-blue-600 hover:underline font-medium list-none">
                        ↓ Operator manuals ({selectedRevision.operatingManuals.length} languages)
                      </summary>
                      <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded shadow-lg p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                        {selectedRevision.operatingManuals.map((m, i) => (
                          <a
                            key={i}
                            href={`https://shop.wackerneuson.com${m.url}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs whitespace-nowrap"
                          >
                            {m.languages?.[0]?.name ?? m.filename}
                          </a>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Selected diagram detail panel */}
              {selectedDiagram && (
                <div ref={detailPanelRef} className="mx-4 mt-4 rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
                  <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">{selectedDiagram.name}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selectedDiagram._count.lines} parts · component {selectedDiagram.componentCode ?? "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedDiagram(null)}
                      className="cursor-pointer text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
                    >
                      ×
                    </button>
                  </div>
                  <DiagramViewer diagram={selectedDiagram} parts={parts} loadingParts={loadingParts} />
                </div>
              )}

              {/* Diagram grid */}
              <div className="p-4">
                {loadingDiagrams && (
                  <p className="text-sm text-gray-400 text-center py-10">Loading diagrams…</p>
                )}
                {!loadingDiagrams && diagrams.length === 0 && selectedRevision && (
                  <div className="text-center py-16 text-gray-400">
                    <p className="text-3xl mb-2">📄</p>
                    <p className="text-sm">
                      {selectedRevision.hasBom
                        ? "No diagrams found for this revision"
                        : "This revision has no interactive BOM (PDF-only)"}
                    </p>
                  </div>
                )}
                {!loadingDiagrams && diagrams.length > 0 && (
                  <>
                    <p className="text-xs text-gray-400 mb-3">{diagrams.length} diagrams — click a thumbnail to open</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {diagrams.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => selectDiagram(d)}
                          className={`cursor-pointer text-left rounded-lg border overflow-hidden transition-all ${
                            selectedDiagram?.id === d.id
                              ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
                              : "border-gray-200 hover:border-blue-400 hover:shadow-sm"
                          }`}
                        >
                          <div className="bg-gray-50 flex items-center justify-center h-28 overflow-hidden">
                            {d.diagramImageKey ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/oem/image/${d.diagramImageKey}`}
                                alt={d.name}
                                className="object-contain h-full w-full"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <span className="text-xs text-gray-400">No image</span>
                            )}
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{d.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{d._count.lines} parts</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
