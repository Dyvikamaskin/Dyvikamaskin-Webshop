"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function categoryLabel(path: string[] | null) {
  if (!path?.length) return "";
  return path.join(" › ");
}

// ── Interactive Diagram Viewer ────────────────────────────────────────────────

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
        // Scroll the newly added row into view
        const el = rowRefs.current.get(String(calloutId));
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return next;
    });
  };

  // A callout is "lit" if it's selected OR being hovered
  const isLit = (id: number) => activeCallouts.has(id) || hoveredCallout === id;
  const { hotspots = [], globalx = 1000, globaly = 1000 } = hotspotsData ?? {};

  return (
    // Side-by-side: diagram fills left half, table fills right half
    <div className="flex min-h-0 flex-1">

      {/* ── Left: diagram + SVG overlay ── */}
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
            {/* SVG overlay — same intrinsic size as the image via viewBox */}
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

                  // Box fill/stroke state
                  const boxFill = active ? "#e65c00" : lit ? "#f97316" : "#fff";
                  const boxStroke = lit ? "#e65c00" : "#b45309";
                  const textFill = lit ? "#fff" : "#78350f";

                  // Label font size scales with box size
                  const fontSize = Math.max(18, Math.min(w, hh) * 0.55);

                  return (
                    <g
                      key={`${h.id}-${i}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleCallout(h.id)}
                      onMouseEnter={() => setHoveredCallout(h.id)}
                      onMouseLeave={() => setHoveredCallout(null)}
                    >
                      {/* Hotspot bounding rect — transparent, used for hit area */}
                      <rect
                        x={h.x1} y={h.y1} width={w} height={hh}
                        fill="transparent"
                        stroke="none"
                      />
                      {/* Callout label box */}
                      <rect
                        x={cx - fontSize * 0.75}
                        y={cy - fontSize * 0.6}
                        width={fontSize * 1.5}
                        height={fontSize * 1.2}
                        rx={3}
                        fill={boxFill}
                        stroke={boxStroke}
                        strokeWidth={lit ? 3 : 1.5}
                        style={{ transition: "fill 0.1s, stroke 0.1s" }}
                      />
                      {/* Callout number */}
                      <text
                        x={cx} y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={fontSize}
                        fontWeight="600"
                        fontFamily="sans-serif"
                        fill={textFill}
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
          <div className="flex items-center justify-center w-full h-48 text-sm text-gray-400">
            No image
          </div>
        )}
      </div>

      {/* ── Right: parts table ── */}
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
                      backgroundColor: active
                        ? "#fed7aa"
                        : lit
                        ? "#ffedd5"
                        : l.part.isRecommended
                        ? "#fef9c3"
                        : "transparent",
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OemExplorer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MachineResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedMachine, setSelectedMachine] = useState<MachineDetail | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [loadingDiagrams, setLoadingDiagrams] = useState(false);
  const [selectedDiagram, setSelectedDiagram] = useState<Diagram | null>(null);
  const [parts, setParts] = useState<PartLine[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const pendingDiagramId = useRef<string | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/oem/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => { setResults(data); setSearching(false); })
        .catch(() => setSearching(false));
    }, 300);
  }, [query]);

  const selectMachine = useCallback(async (m: MachineResult) => {
    setSelectedDiagram(null);
    setDiagrams([]);
    setSelectedRevisionId(null);
    setParts([]);
    const data: MachineDetail = await fetch(`/api/oem/machine/${m.code}`).then((r) => r.json());
    setSelectedMachine(data);
    const first = data.revisions.find((r) => r._count.diagrams > 0) ?? data.revisions[0];
    if (first) setSelectedRevisionId(first.id);
    window.history.replaceState(null, "", `?q=${encodeURIComponent(m.modelName)}&machine=${encodeURIComponent(m.code)}`);
  }, []);

  // Boot: read ?machine= and ?diagram= from URL and auto-select on first render
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const machineCode = params.get("machine");
    const q = params.get("q");
    const diagramId = params.get("diagram");
    if (q) setQuery(q);

    if (diagramId) {
      // Fetch diagram to discover its machine + revision, then load accordingly
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

    if (!machineCode) return;
    fetch(`/api/oem/machine/${machineCode}`)
      .then((r) => r.json())
      .then((data: MachineDetail) => {
        setSelectedMachine(data);
        const first = data.revisions.find((r) => r._count.diagrams > 0) ?? data.revisions[0];
        if (first) setSelectedRevisionId(first.id);
      })
      .catch(() => {});
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
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="font-semibold text-gray-800 text-sm whitespace-nowrap">OEM Parts Explorer</span>
        <div className="relative flex-1 max-w-lg">
          <input
            type="search"
            placeholder="Search machines — e.g. BS50, DPU2540, EZ17, RD24"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && (
            <span className="absolute right-3 top-2.5 text-gray-400 text-xs animate-pulse">…</span>
          )}
        </div>
        <span className="text-xs text-gray-400">4,412 machines · 422K diagrams · 7.6M part lines</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          {results.length === 0 && query.length < 2 && (
            <div className="p-6 text-center text-sm text-gray-400">
              <p className="text-2xl mb-2">🔍</p>
              <p>Type a model name to search</p>
            </div>
          )}
          {results.length === 0 && query.length >= 2 && !searching && (
            <p className="p-4 text-sm text-gray-400 text-center">No results for "{query}"</p>
          )}
          <ul>
            {results.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => selectMachine(m)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer ${
                    selectedMachine?.id === m.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                  }`}
                >
                  <p className={`text-sm font-medium ${m.isDiscontinued ? "text-gray-400 line-through" : "text-gray-800"}`}>
                    {m.displayName}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{categoryLabel(m.categoryPath)}</p>
                  <p className="text-xs text-gray-400 font-mono">{m.code}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-y-auto">
          {!selectedMachine ? (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">
              Select a machine from the list
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Machine header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
                <h1 className="text-lg font-semibold text-gray-900">{selectedMachine.displayName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {categoryLabel(selectedMachine.categoryPath)} · Model Number: {selectedMachine.code}
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
                  <span><span className="text-gray-400">Model no.:</span> {selectedMachine!.code}</span>
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
                      target="_blank"
                      rel="noopener noreferrer"
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
                            target="_blank"
                            rel="noopener noreferrer"
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

              {/* Selected diagram detail panel — shown ABOVE the grid */}
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
                  <DiagramViewer
                    diagram={selectedDiagram}
                    parts={parts}
                    loadingParts={loadingParts}
                  />
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
                    <p className="text-xs text-gray-400 mb-3">
                      {diagrams.length} diagrams — click a thumbnail to open
                    </p>
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
