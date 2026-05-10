"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  type AdminCategoryNode,
} from "@/app/actions/category";

interface Props {
  initialTree: AdminCategoryNode[];
}

const inputStyle: React.CSSProperties = {
  padding: "0.45rem 0.65rem",
  border: "1px solid #e2e8f0",
  borderRadius: "5px",
  fontSize: "0.875rem",
  color: "#0f172a",
  background: "#fff",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.4rem 0.7rem",
  border: "1px solid #e2e8f0",
  borderRadius: "5px",
  fontSize: "0.8rem",
  background: "#fff",
  color: "#0f172a",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  fontWeight: 600,
};

export function KategorierClient({ initialTree }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  return (
    <div>
      {error ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "0.6rem 0.85rem",
            borderRadius: "6px",
            fontSize: "0.85rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      ) : null}

      <CreateForm
        parentId={null}
        label="Legg til toppkategori"
        disabled={pending}
        onCreate={async (name) => {
          setError(null);
          startTransition(async () => {
            const result = await createCategoryAction({ name, parentId: null });
            if (!result.ok) showError(result.error);
            else refresh();
          });
        }}
      />

      {initialTree.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: "1rem" }}>
          Ingen kategorier ennå. Legg til den første over.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            marginTop: "1.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            background: "#fff",
          }}
        >
          {initialTree.map((node, i) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              isFirst={i === 0}
              isLast={i === initialTree.length - 1}
              pending={pending}
              startTransition={startTransition}
              showError={showError}
              refresh={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────

function CategoryRow({
  node,
  depth,
  isFirst,
  isLast,
  pending,
  startTransition,
  showError,
  refresh,
}: {
  node: AdminCategoryNode;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  showError: (msg: string) => void;
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState(node.name);

  async function commitRename() {
    if (name.trim() === node.name) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateCategoryAction({ id: node.id, name: name.trim() });
      if (!result.ok) showError(result.error);
      else {
        setEditing(false);
        refresh();
      }
    });
  }

  async function handleDelete() {
    if (!confirm(`Slett «${node.name}»?`)) return;
    startTransition(async () => {
      const result = await deleteCategoryAction(node.id);
      if (!result.ok) showError(result.error);
      else refresh();
    });
  }

  return (
    <li style={{ borderBottom: "1px solid #f1f5f9" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.6rem 0.85rem",
          paddingLeft: `${0.85 + depth * 1.5}rem`,
        }}
      >
        <span style={{ color: "#64748b", fontSize: "0.75rem", width: "1rem" }}>
          {depth > 0 ? "↳" : ""}
        </span>

        {editing ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setName(node.name);
                }
              }}
            />
            <button
              type="button"
              onClick={commitRename}
              style={primaryButtonStyle}
              disabled={pending}
            >
              Lagre
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(node.name);
              }}
              style={buttonStyle}
              disabled={pending}
            >
              Avbryt
            </button>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 500, color: "#0f172a", flex: 1 }}>
              {node.name}
              <span style={{ marginLeft: "0.5rem", color: "#94a3b8", fontSize: "0.75rem" }}>
                {node.slug}
              </span>
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                color: node.productCount > 0 ? "#0f172a" : "#94a3b8",
                background: node.productCount > 0 ? "#f1f5f9" : "transparent",
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
              }}
            >
              {node.productCount} produkt
              {node.productCount === 1 ? "" : "er"}
            </span>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              style={buttonStyle}
              disabled={pending}
              title="Legg til underkategori"
            >
              + Under
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={buttonStyle}
              disabled={pending}
            >
              Endre
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{ ...buttonStyle, color: "#991b1b", borderColor: "#fecaca" }}
              disabled={pending || node.children.length > 0 || node.productCount > 0}
              title={
                node.children.length > 0
                  ? "Har underkategorier"
                  : node.productCount > 0
                  ? "Har produkter"
                  : "Slett"
              }
            >
              Slett
            </button>
          </>
        )}
      </div>

      {showAdd ? (
        <div
          style={{
            paddingLeft: `${1.85 + depth * 1.5}rem`,
            paddingRight: "0.85rem",
            paddingBottom: "0.85rem",
          }}
        >
          <CreateForm
            parentId={node.id}
            label={`Legg til under ${node.name}`}
            disabled={pending}
            onCreate={async (childName) => {
              startTransition(async () => {
                const result = await createCategoryAction({
                  name: childName,
                  parentId: node.id,
                });
                if (!result.ok) showError(result.error);
                else {
                  setShowAdd(false);
                  refresh();
                }
              });
            }}
          />
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {node.children.map((child, i) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isFirst={i === 0}
              isLast={i === node.children.length - 1}
              pending={pending}
              startTransition={startTransition}
              showError={showError}
              refresh={refresh}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ─── Create form ─────────────────────────────────────────────────────────

function CreateForm({
  parentId,
  label,
  disabled,
  onCreate,
}: {
  parentId: string | null;
  label: string;
  disabled: boolean;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setName("");
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={label}
        style={{ ...inputStyle, flex: 1 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={submit}
        style={primaryButtonStyle}
        disabled={disabled || !name.trim()}
      >
        + Legg til
      </button>
    </div>
  );
}
