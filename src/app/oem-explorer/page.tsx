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

type Revision = {
  id: string;
  revisionTag: string;
  hasBom: boolean;
  sparePartListCode: string | null;
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

function categoryLabel(path: string[] | null) {
  if (!path?.length) return "";
  return path.join(" › ");
}

function PartsTable({ diagramId }: { diagramId: string }) {
  const [lines, setLines] = useState<PartLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setLines([]);
    fetch(`/api/oem/diagram/${diagramId}/parts`)
      .then((r) => r.json())
      .then((data) => { setLines(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [diagramId]);

  if (loading)
    return <p className="text-sm text-gray-400 py-6 text-center">Loading parts…</p>;
  if (!lines.length)
    return <p className="text-sm text-gray-400 py-6 text-center">No parts listed</p>;

  return (
    <div className="overflow-auto rounded border border-gray-200 text-sm">
      <table className="w-full min-w-[500px]">
        <thead className="bg-gray-50 sticky top-0 text-xs uppercase text-gray-500 tracking-wide">
          <tr>
            <th className="text-left px-3 py-2 w-12">#</th>
            <th className="text-left px-3 py-2 w-36">Part no.</th>
            <th className="text-left px-3 py-2">Name</th>
            <th className="text-center px-3 py-2 w-12">Qty</th>
            <th className="text-left px-3 py-2 w-12">UOM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((l, i) => (
            <tr
              key={`${i}-${l.callout}-${l.part.partNumber}`}
              className={`hover:bg-blue-50 ${l.part.isRecommended ? "bg-amber-50" : ""}`}
            >
              <td className="px-3 py-1.5 font-mono text-gray-500 text-xs">{l.callout}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{l.part.partNumber}</td>
              <td className="px-3 py-1.5">
                {l.part.name}
                {l.part.isRecommended && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    ★ rec.
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5 text-center text-gray-600">{l.qty ?? "—"}</td>
              <td className="px-3 py-1.5 text-gray-400 text-xs">{l.part.unitOfMeasure ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  // Debounced search
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

  // Select machine
  const selectMachine = useCallback(async (m: MachineResult) => {
    setSelectedDiagram(null);
    setDiagrams([]);
    setSelectedRevisionId(null);
    setParts([]);
    const data: MachineDetail = await fetch(`/api/oem/machine/${m.code}`).then((r) => r.json());
    setSelectedMachine(data);
    const first = data.revisions.find((r) => r._count.diagrams > 0) ?? data.revisions[0];
    if (first) setSelectedRevisionId(first.id);
  }, []);

  // Load diagrams when revision changes
  useEffect(() => {
    if (!selectedRevisionId) return;
    setLoadingDiagrams(true);
    setSelectedDiagram(null);
    setParts([]);
    fetch(`/api/oem/revision/${selectedRevisionId}/diagrams`)
      .then((r) => r.json())
      .then((data) => { setDiagrams(data); setLoadingDiagrams(false); })
      .catch(() => setLoadingDiagrams(false));
  }, [selectedRevisionId]);

  // Select diagram and load parts
  const selectDiagram = useCallback((d: Diagram) => {
    setSelectedDiagram(d);
    setLoadingParts(true);
    setParts([]);
    fetch(`/api/oem/diagram/${d.id}/parts`)
      .then((r) => r.json())
      .then((data) => { setParts(data); setLoadingParts(false); })
      .catch(() => setLoadingParts(false));
    // Scroll detail panel into view
    setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const selectedRevision = selectedMachine?.revisions.find((r) => r.id === selectedRevisionId);

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Top bar */}
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
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
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
                  {categoryLabel(selectedMachine.categoryPath)} · SAP {selectedMachine.code}
                </p>
              </div>

              {/* Revision tabs */}
              {selectedMachine.revisions.length > 0 && (
                <div className="flex gap-1 px-6 py-2 bg-white border-b border-gray-200 overflow-x-auto sticky top-[73px] z-10">
                  {selectedMachine.revisions.map((rev) => (
                    <button
                      key={rev.id}
                      onClick={() => setSelectedRevisionId(rev.id)}
                      className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                        selectedRevisionId === rev.id
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      } ${rev._count.diagrams === 0 ? "opacity-40" : ""}`}
                    >
                      {rev.revisionTag}
                      <span className="ml-1 opacity-60">({rev._count.diagrams})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Selected diagram detail panel — shown ABOVE the grid ── */}
              {selectedDiagram && (
                <div ref={detailPanelRef} className="mx-4 mt-4 rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">{selectedDiagram.name}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selectedDiagram._count.lines} parts · component {selectedDiagram.componentCode ?? "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedDiagram(null)}
                      className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  <div className="flex gap-4 p-4">
                    {/* Diagram image */}
                    {selectedDiagram.diagramImageKey && (
                      <div className="shrink-0 w-80 xl:w-96 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/oem/image/${selectedDiagram.diagramImageKey}`}
                          alt={selectedDiagram.name}
                          className="w-full h-full object-contain max-h-72"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}

                    {/* Parts table */}
                    <div className="flex-1 min-w-0">
                      {loadingParts ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Loading parts…</p>
                      ) : parts.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">No parts listed</p>
                      ) : (
                        <div className="overflow-auto max-h-72 rounded border border-gray-200 text-sm">
                          <table className="w-full min-w-[400px]">
                            <thead className="bg-gray-50 sticky top-0 text-xs uppercase text-gray-500 tracking-wide">
                              <tr>
                                <th className="text-left px-3 py-2 w-10">#</th>
                                <th className="text-left px-3 py-2 w-32">Part no.</th>
                                <th className="text-left px-3 py-2">Name</th>
                                <th className="text-center px-3 py-2 w-10">Qty</th>
                                <th className="text-left px-3 py-2 w-10">UOM</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {parts.map((l, i) => (
                                <tr
                                  key={`${i}-${l.callout}-${l.part.partNumber}`}
                                  className={`hover:bg-blue-50 ${l.part.isRecommended ? "bg-amber-50" : ""}`}
                                >
                                  <td className="px-3 py-1.5 font-mono text-gray-500 text-xs">{l.callout}</td>
                                  <td className="px-3 py-1.5 font-mono text-xs">{l.part.partNumber}</td>
                                  <td className="px-3 py-1.5">
                                    {l.part.name}
                                    {l.part.isRecommended && (
                                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">★ rec.</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 text-center text-gray-600">{l.qty ?? "—"}</td>
                                  <td className="px-3 py-1.5 text-gray-400 text-xs">{l.part.unitOfMeasure ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Diagram grid ── */}
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
                      {diagrams.length} diagrams — click to view parts
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
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
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
