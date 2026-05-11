/**
 * Category tree utilities — Phase 5
 *
 * - MAX_CATEGORY_DEPTH from env (default 4)
 * - Products can only be assigned to leaf categories (no children)
 * - Self-referencing tree via parentId
 */

import { prisma } from "@/lib/prisma";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
  depth: number;
  children: CategoryNode[];
}

/** Flat category (no children array) */
export type FlatCategory = Omit<CategoryNode, "children">;

// ─── Config ───────────────────────────────────────────────────────────────────

export function getMaxCategoryDepth(): number {
  const raw = parseInt(process.env.MAX_CATEGORY_DEPTH ?? "4", 10);
  return Number.isNaN(raw) || raw < 1 ? 4 : raw;
}

// ─── Tree building ─────────────────────────────────────────────────────────────

/**
 * Convert a flat list (with parentId) into a nested tree.
 * Orphan nodes are attached to the root level.
 */
export function buildCategoryTree(
  flat: Omit<FlatCategory, "depth">[],
  rootDepth = 0
): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  // First pass — create all nodes
  for (const cat of flat) {
    map.set(cat.id, { ...cat, depth: rootDepth, children: [] });
  }

  // Second pass — wire up parent → child relationships
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Third pass — assign correct depths
  function assignDepths(nodes: CategoryNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      assignDepths(node.children, depth + 1);
    }
  }
  assignDepths(roots, rootDepth);

  // Sort by displayOrder at every level
  function sortNodes(nodes: CategoryNode[]) {
    nodes.sort((a, b) => a.displayOrder - b.displayOrder);
    for (const node of nodes) sortNodes(node.children);
  }
  sortNodes(roots);

  return roots;
}

// ─── Database queries ─────────────────────────────────────────────────────────

/**
 * Fetch all categories and return as a nested tree.
 */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      displayOrder: true,
    },
    orderBy: { displayOrder: "asc" },
  });

  return buildCategoryTree(categories);
}

/**
 * Fetch a single category by slug together with its ancestor chain.
 * Returns null if not found.
 */
export async function getCategoryBySlug(slug: string): Promise<{
  category: FlatCategory;
  ancestors: FlatCategory[];
} | null> {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      displayOrder: true,
    },
  });

  if (!category) return null;

  // Walk up the ancestor chain
  const ancestors: FlatCategory[] = [];
  let parentId: string | null = category.parentId;

  while (parentId) {
     
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        displayOrder: true,
      },
    });
    if (!parent) break;
    ancestors.unshift({ ...parent, depth: 0 }); // prepend → root first
    parentId = parent.parentId;
  }

  // Fix ancestor depths
  ancestors.forEach((a, i) => {
    a.depth = i;
  });

  return {
    category: { ...category, depth: ancestors.length },
    ancestors,
  };
}

/**
 * Return the IDs of a category *and all its descendants*.
 * Used when filtering products by a non-leaf category.
 */
export async function getCategoryDescendantIds(
  categoryId: string
): Promise<string[]> {
  const all = await prisma.category.findMany({
    select: { id: true, parentId: true },
  });

  // Build child map
  const childMap = new Map<string, string[]>();
  for (const cat of all) {
    if (cat.parentId) {
      const arr = childMap.get(cat.parentId) ?? [];
      arr.push(cat.id);
      childMap.set(cat.parentId, arr);
    }
  }

  // BFS from categoryId
  const result = new Set<string>();
  const queue = [categoryId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.add(id);
    for (const childId of childMap.get(id) ?? []) {
      queue.push(childId);
    }
  }

  return [...result];
}

/**
 * A category is a leaf when it has no children.
 * Products may only be assigned to leaf categories.
 */
export async function isLeafCategory(categoryId: string): Promise<boolean> {
  const count = await prisma.category.count({ where: { parentId: categoryId } });
  return count === 0;
}

/**
 * Validate that adding a child to `parentId` would not exceed the depth limit.
 * Pass null for `parentId` to validate a root-level category.
 */
export async function validateCategoryDepth(
  parentId: string | null
): Promise<{ valid: boolean; depth: number }> {
  const maxDepth = getMaxCategoryDepth();

  if (!parentId) {
    return { valid: maxDepth >= 1, depth: 1 };
  }

  let depth = 1; // the new child will be at depth + parent_depth
  let currentId: string | null = parentId;

  while (currentId) {
    depth++;
    if (depth > maxDepth) return { valid: false, depth };

     
    const parent: { parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    currentId = parent?.parentId ?? null;
  }

  return { valid: depth <= maxDepth, depth };
}

/**
 * Resolve a URL slug path like ["maskiner", "boremaskiner"] to a leaf category.
 * Validates that the path matches the actual ancestor chain.
 * Returns null if the path is invalid or the category doesn't exist.
 */
export async function resolveCategoryPath(
  slugPath: string[]
): Promise<FlatCategory | null> {
  if (slugPath.length === 0) return null;

  const leafSlug = slugPath[slugPath.length - 1];
  const result = await getCategoryBySlug(leafSlug);
  if (!result) return null;

  // Validate that the URL path matches the ancestor chain
  if (slugPath.length > 1) {
    const ancestorSlugs = result.ancestors.map((a) => a.slug);
    const urlParentSlugs = slugPath.slice(0, -1);

    // The last N ancestors must match the URL parent slugs
    const offset = ancestorSlugs.length - urlParentSlugs.length;
    if (offset < 0) return null;

    const match = urlParentSlugs.every(
      (slug, i) => ancestorSlugs[offset + i] === slug
    );
    if (!match) return null;
  }

  return result.category;
}
