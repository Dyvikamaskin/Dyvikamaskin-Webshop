"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon } from "@/components/layout/icons";

/**
 * SearchBar — Phase 0.5 + Phase 5 follow-up (autocomplete)
 *
 * Top-bar search input with an autocomplete dropdown sourced from
 * `/api/search`. Three layers of fallback so search keeps working when
 * the JS path fails:
 *
 *   1. Optimistic dropdown — debounced fetch, keyboard + mouse navigation.
 *   2. Form submit — Enter without a highlighted result still GETs
 *      `/sok?q=…` so the existing results page handles the query.
 *   3. No-JS — the form action and method are static; the bar still
 *      submits before hydration.
 */

interface SearchResult {
  sku: string;
  name: string;
  brand: string | null;
  mainImage: string | null;
  href: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
}

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 8;

export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch. Aborts the previous in-flight request so a slow
  // network can't deliver a stale response after a faster newer one.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=${RESULT_LIMIT}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as SearchResponse;
        setResults(data.results);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close when the user navigates anywhere — keeps the dropdown from
  // sticking around behind the rendered search-results page.
  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [pathname]);

  const showDropdown = open && query.trim().length >= MIN_QUERY_LENGTH;
  const hasResults = results.length > 0;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (hasResults ? (i + 1) % results.length : -1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          hasResults ? (i <= 0 ? results.length - 1 : i - 1) : -1,
        );
      } else if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        router.push(results[activeIndex].href);
        setOpen(false);
      }
    },
    [showDropdown, hasResults, results, activeIndex, router],
  );

  const dropdown = useMemo(() => {
    if (!showDropdown) return null;
    return (
      <div
        id={listboxId}
        role="listbox"
        aria-label="Søkeforslag"
        className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[60vh] overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
      >
        {loading && !hasResults ? (
          <div className="px-4 py-3 text-sm text-slate-500">Søker…</div>
        ) : !hasResults ? (
          <div className="px-4 py-3 text-sm text-slate-500">
            Ingen treff for «{query.trim()}».
          </div>
        ) : (
          <ul className="py-1">
            {results.map((r, i) => (
              <li key={r.sku}>
                <Link
                  href={r.href}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => setOpen(false)}
                  className={
                    "flex items-center gap-3 px-3 py-2 text-sm transition " +
                    (i === activeIndex
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-800 hover:bg-slate-50")
                  }
                >
                  {r.mainImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.mainImage}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-white object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-slate-50" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {r.brand ? `${r.brand} · ` : ""}
                      {r.sku}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }, [
    showDropdown,
    loading,
    hasResults,
    results,
    activeIndex,
    query,
    listboxId,
  ]);

  return (
    <div ref={containerRef} className="relative flex w-full">
      <form
        action="/sok"
        method="get"
        role="search"
        className="flex w-full items-center"
      >
        <label className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-slate-400 focus-within:bg-white">
          <SearchIcon className="shrink-0 text-lg text-slate-500" aria-hidden />
          <input
            type="search"
            name="q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            placeholder="Søk produkt, varemerke, kategori"
            aria-label="Søk"
            aria-autocomplete="list"
            aria-controls={showDropdown ? listboxId : undefined}
            aria-expanded={showDropdown}
            aria-activedescendant={undefined}
            role="combobox"
            autoComplete="off"
            className="h-10 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="hidden shrink-0 rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 sm:inline-block"
          >
            Søk
          </button>
        </label>
      </form>
      {dropdown}
    </div>
  );
}
