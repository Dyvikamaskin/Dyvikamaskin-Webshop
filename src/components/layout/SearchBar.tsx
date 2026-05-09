import { SearchIcon } from "@/components/layout/icons";

/**
 * SearchBar — Phase 0.5
 *
 * Static search form. Submitting issues a GET to `/sok?q=…`. No
 * autocomplete in this phase; the bar is shaped so Phase 5 can add
 * autocomplete by upgrading the input to a client component without
 * disturbing layout.
 */
export function SearchBar() {
  return (
    <form
      action="/sok"
      method="get"
      role="search"
      className="flex flex-1 items-center"
    >
      <label className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-slate-400 focus-within:bg-white">
        <SearchIcon className="shrink-0 text-lg text-slate-500" aria-hidden />
        <input
          type="search"
          name="q"
          placeholder="Søk produkt, varemerke, kategori"
          aria-label="Søk"
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
  );
}
