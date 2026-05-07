import Link from "next/link";
import type { CategoryNode } from "@/lib/categories";

interface CategoryNavProps {
  categories: CategoryNode[];
  activeCategoryId?: string;
}

/**
 * Recursive category navigation sidebar.
 * Highlights the active category and its ancestors.
 * Inline styles; Tailwind applied in Phase 5 UI pass.
 */
export function CategoryNav({ categories, activeCategoryId }: CategoryNavProps) {
  return (
    <nav>
      <h3
        style={{
          fontSize: "0.875rem",
          fontWeight: 700,
          color: "#444",
          marginBottom: "0.5rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Kategorier
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        <li style={{ marginBottom: "0.25rem" }}>
          <Link
            href="/produkter"
            style={{
              display: "block",
              padding: "0.25rem 0",
              color: !activeCategoryId ? "#1d4ed8" : "#374151",
              fontWeight: !activeCategoryId ? 700 : 400,
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            Alle produkter
          </Link>
        </li>
        {categories.map((cat) => (
          <CategoryNavItem
            key={cat.id}
            node={cat}
            activeCategoryId={activeCategoryId}
            slugPath={[cat.slug]}
          />
        ))}
      </ul>
    </nav>
  );
}

interface CategoryNavItemProps {
  node: CategoryNode;
  activeCategoryId: string | undefined;
  slugPath: string[];
}

function CategoryNavItem({ node, activeCategoryId, slugPath }: CategoryNavItemProps) {
  const isActive = node.id === activeCategoryId;
  const hasActiveDescendant = containsId(node, activeCategoryId);
  const href = `/kategori/${slugPath.join("/")}`;

  return (
    <li style={{ marginBottom: "0.125rem" }}>
      <Link
        href={href}
        style={{
          display: "block",
          padding: "0.25rem 0",
          paddingLeft: `${node.depth * 0.75}rem`,
          color: isActive ? "#1d4ed8" : "#374151",
          fontWeight: isActive || hasActiveDescendant ? 600 : 400,
          textDecoration: "none",
          fontSize: "0.875rem",
          borderLeft: isActive ? "2px solid #1d4ed8" : "2px solid transparent",
          paddingRight: "0.5rem",
        }}
      >
        {node.name}
      </Link>

      {(isActive || hasActiveDescendant) && node.children.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {node.children.map((child) => (
            <CategoryNavItem
              key={child.id}
              node={child}
              activeCategoryId={activeCategoryId}
              slugPath={[...slugPath, child.slug]}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function containsId(node: CategoryNode, id: string | undefined): boolean {
  if (!id) return false;
  return node.children.some((c) => c.id === id || containsId(c, id));
}
