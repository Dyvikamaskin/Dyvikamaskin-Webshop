"use client";

/**
 * CategoryPicker — Phase 0.6
 *
 * Combobox replacing the flat <select> on the new-product and edit-product
 * forms. Type-ahead matches existing categories by name and full path.
 * If the typed string does not match any existing category, a
 * "+ Opprett kategori" option appears that lets the admin commit to
 * creating a new path on submit.
 *
 * The picker writes to a hidden input named `categoryPath` (the path
 * form, e.g. "verktoy/elektroverktoy"). The product create action
 * resolves the path with findOrCreateCategoryByPath and creates any
 * missing segments.
 *
 * Uncontrolled / form-friendly: works under both Server Action `<form>`
 * and `useState`-driven client forms by emitting the chosen value
 * through the hidden input plus an optional `onChange` callback.
 */

import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

interface PickerCategory {
  id: string;
  name: string;
  /** Slash-separated path of names from root to this node. */
  path: string;
}

interface CategoryPickerProps {
  categories: PickerCategory[];
  /** Initial selection — either a path or null. */
  defaultPath?: string | null;
  /** Form input name. Defaults to "categoryPath". */
  name?: string;
  /** Optional change hook. */
  onChange?: (path: string) => void;
  /** Disable interaction (during submit etc.). */
  disabled?: boolean;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "0.875rem",
  color: "#0f172a",
  background: "#fff",
  boxSizing: "border-box",
};

export function CategoryPicker({
  categories,
  defaultPath,
  name = "categoryPath",
  onChange,
  disabled = false,
}: CategoryPickerProps) {
  // Index path -> category for quick lookup
  const byPath = useMemo(() => {
    const m = new Map<string, PickerCategory>();
    for (const c of categories) m.set(c.path, c);
    return m;
  }, [categories]);

  const initial = (defaultPath && byPath.get(defaultPath)?.path) ?? defaultPath ?? "";

  const [query, setQuery] = useState<string>(initial);
  const [committedPath, setCommittedPath] = useState<string>(initial);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter existing categories by case-insensitive substring of name OR path.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories.slice(0, 20);
    return categories
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.path.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [categories, query]);

  // Has the user typed an exact path that does not exist? Then offer create.
  const trimmedQuery = query.trim();
  const exactExists = trimmedQuery && byPath.has(trimmedQuery);
  const offerCreate =
    trimmedQuery.length > 0 &&
    !exactExists &&
    matches.every((m) => m.path !== trimmedQuery);

  function commit(path: string) {
    setCommittedPath(path);
    setQuery(path);
    setOpen(false);
    onChange?.(path);
  }

  function handleQueryChange(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    setHighlight(0);
    // Until the admin picks a row, the path follows the typed text —
    // useful when typing a brand-new path like
    // "verktoy/nytt-segment".
    setCommittedPath(e.target.value);
    onChange?.(e.target.value);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") setOpen(true);
      return;
    }
    const total = matches.length + (offerCreate ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % Math.max(total, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + Math.max(total, 1)) % Math.max(total, 1));
    } else if (e.key === "Enter") {
      // Always intercept Enter while the dropdown is open so we never
      // accidentally submit the surrounding product form mid-pick.
      e.preventDefault();
      if (highlight < matches.length && matches[highlight]) {
        commit(matches[highlight].path);
      } else if (offerCreate) {
        commit(trimmedQuery);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleBlur() {
    // Close after a short delay so option clicks register first.
    setTimeout(() => setOpen(false), 120);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        autoComplete="off"
        value={query}
        onChange={handleQueryChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Velg eller opprett kategori"
        style={inputStyle}
        disabled={disabled}
        aria-controls={`${inputId}-listbox`}
        aria-expanded={open}
        role="combobox"
      />

      {/* Hidden form value */}
      <input type="hidden" name={name} value={committedPath} />

      {open && (matches.length > 0 || offerCreate) && (
        <ul
          id={`${inputId}-listbox`}
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            margin: "4px 0 0",
            padding: "4px 0",
            maxHeight: "260px",
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            zIndex: 20,
            listStyle: "none",
          }}
        >
          {matches.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(m.path);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "0.4rem 0.75rem",
                fontSize: "0.85rem",
                cursor: "pointer",
                background: i === highlight ? "#f1f5f9" : "transparent",
                color: "#0f172a",
              }}
            >
              <div style={{ fontWeight: 500 }}>{m.name}</div>
              {m.path !== m.name ? (
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                  {m.path}
                </div>
              ) : null}
            </li>
          ))}

          {offerCreate ? (
            <li
              role="option"
              aria-selected={highlight === matches.length}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(trimmedQuery);
              }}
              onMouseEnter={() => setHighlight(matches.length)}
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.85rem",
                cursor: "pointer",
                background:
                  highlight === matches.length ? "#f1f5f9" : "transparent",
                color: "#1e40af",
                borderTop:
                  matches.length > 0 ? "1px solid #f1f5f9" : "none",
                fontWeight: 600,
              }}
            >
              + Opprett kategori «{trimmedQuery}»
              {trimmedQuery.includes("/") ? (
                <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2, fontWeight: 400 }}>
                  Manglende segmenter opprettes automatisk.
                </div>
              ) : null}
            </li>
          ) : null}
        </ul>
      )}

      <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.3rem" }}>
        Skriv navn eller sti (f.eks. <code>verktoy/elektroverktoy</code>).
        Manglende segmenter opprettes automatisk når produktet lagres.
      </p>
    </div>
  );
}
