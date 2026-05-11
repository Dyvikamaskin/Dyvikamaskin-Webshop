"use server";

/**
 * Category server actions — Phase 0.6.
 *
 * Categories become a live, editable taxonomy. Manual product creation
 * and CSV import can declare a category by name; if it does not exist
 * (or any of its ancestors), it is created on demand.
 *
 * All write paths are gated by requireRole(STORE_MANAGER). Reads use
 * Prisma directly.
 */

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { slugify } from "@/lib/slugify";
import {
  validateCategoryDepth,
  type CategoryNode,
  buildCategoryTree,
} from "@/lib/categories";
import { Prisma, UserRole } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";

// ─── Types ────────────────────────────────────────────────────────────────

export type CategoryActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string; code?: string };

interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
}

interface UpdateCategoryInput {
  id: string;
  name?: string;
  parentId?: string | null;
}

interface ReorderEntry {
  id: string;
  displayOrder: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a unique slug from a name. If the base slug already exists at
 * any level, append `-2`, `-3`, ... until unique. (Slugs are globally
 * unique per the schema's `@unique` constraint on `slug`.)
 */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!base) {
    throw new Error("Navn kan ikke være tomt");
  }

  let candidate = base;
  let suffix = 2;
  // Cheap loop — the call site only fires when a path segment is
  // genuinely new, so collisions are rare and bounded.
   
  while (true) {
    const exists = await prisma.category.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

/** Next displayOrder for a parent (or root level when parentId is null). */
async function nextDisplayOrder(parentId: string | null): Promise<number> {
  const max = await prisma.category.findFirst({
    where: { parentId },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  return (max?.displayOrder ?? -1) + 1;
}

/** Walk up from a category, returning ancestor ids in root-first order. */
async function ancestorIds(categoryId: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null = categoryId;
  while (cursor) {
    const row: { parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    if (!row) break;
    if (row.parentId) out.push(row.parentId);
    cursor = row.parentId;
  }
  return out.reverse();
}

// ─── createCategoryAction ─────────────────────────────────────────────────

/**
 * Create a single category at root or under a parent. Slug is generated
 * from the name and made globally unique. Refuses if it would exceed
 * MAX_CATEGORY_DEPTH.
 */
export async function createCategoryAction(
  input: CreateCategoryInput
): Promise<CategoryActionResult<{ id: string; slug: string }>> {
  await requireRole(UserRole.STORE_MANAGER);

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Navn er påkrevd.", code: "EMPTY_NAME" };
  }

  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) {
      return { ok: false, error: "Foreldrekategori finnes ikke.", code: "PARENT_NOT_FOUND" };
    }
  }

  const depth = await validateCategoryDepth(parentId);
  if (!depth.valid) {
    return {
      ok: false,
      error: `Maks dybde overskredet (${depth.depth}).`,
      code: "DEPTH_EXCEEDED",
    };
  }

  const slug = await uniqueSlug(name);
  const displayOrder = await nextDisplayOrder(parentId);

  const created = await prisma.category.create({
    data: { name, slug, parentId, displayOrder },
    select: { id: true, slug: true },
  });

  revalidatePath("/admin/kategorier");
  revalidatePath("/", "layout"); // drawer reads tree on every storefront page

  return { ok: true, data: created };
}

// ─── findOrCreateCategoryByPath ───────────────────────────────────────────

export interface PathResolution {
  /** id of the leaf (last segment) category. */
  leafId: string;
  /** Slug of the leaf, useful for redirects and debugging. */
  leafSlug: string;
  /** Names of segments newly created by this call (root → leaf). */
  created: string[];
}

/**
 * Resolve a slash-separated path like "verktoy/elektroverktoy/borrmaskiner"
 * to a leaf category id. Walks the tree segment by segment, creating any
 * segment that does not exist under the prior parent.
 *
 * Pure idempotent — calling twice with the same path returns the same
 * leafId and `created: []` on the second call.
 *
 * Each segment is matched against existing children **by slugified name**
 * (so the input may be either the human name "Elektroverktøy" or the
 * slug "elektroverktoy" — both resolve identically).
 *
 * NOT a server action — used from inside other actions (createProductAction,
 * CSV import). Caller must already be authorised.
 */
export async function findOrCreateCategoryByPath(
  path: string
): Promise<PathResolution> {
  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Tom kategoristi");
  }

  let parentId: string | null = null;
  let leafId: string | null = null;
  let leafSlug: string | null = null;
  const created: string[] = [];

  for (const segment of segments) {
    const candidateSlug = slugify(segment);
    if (!candidateSlug) {
      throw new Error(`Ugyldig kategorisegment: «${segment}»`);
    }

    // Look for an existing child of the current parent whose slug
    // matches the segment (after slugification).
    const existing: { id: string; slug: string } | null =
      await prisma.category.findFirst({
        where: { parentId, slug: candidateSlug },
        select: { id: true, slug: true },
      });

    if (existing) {
      parentId = existing.id;
      leafId = existing.id;
      leafSlug = existing.slug;
      continue;
    }

    // Not found — depth check before creating.
    const depthCheck = await validateCategoryDepth(parentId);
    if (!depthCheck.valid) {
      throw new Error(`Maks dybde overskredet ved «${segment}».`);
    }

    const uniqueSeg = await uniqueSlug(segment);
    const order = await nextDisplayOrder(parentId);

    const newRow: { id: string; slug: string } = await prisma.category.create({
      data: {
        name: segment,
        slug: uniqueSeg,
        parentId,
        displayOrder: order,
      },
      select: { id: true, slug: true },
    });

    parentId = newRow.id;
    leafId = newRow.id;
    leafSlug = newRow.slug;
    created.push(segment);
  }

  if (!leafId || !leafSlug) {
    // Unreachable — segments.length > 0 guarantees at least one iteration.
    throw new Error("Klarte ikke å resolvere kategoristi.");
  }

  return { leafId, leafSlug, created };
}

// ─── updateCategoryAction ─────────────────────────────────────────────────

/**
 * Rename or move a category. Renaming does NOT change the slug (URLs
 * stay stable). Moving (changing parentId) refuses if it would cycle
 * or exceed depth.
 */
export async function updateCategoryAction(
  input: UpdateCategoryInput
): Promise<CategoryActionResult> {
  await requireRole(UserRole.STORE_MANAGER);

  const data: Prisma.CategoryUpdateInput = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: "Navn kan ikke være tomt." };
    data.name = trimmed;
  }

  if (input.parentId !== undefined) {
    const newParent = input.parentId;

    // Cycle check — newParent cannot be the moving node itself or any
    // of its descendants.
    if (newParent === input.id) {
      return { ok: false, error: "Kan ikke flytte en kategori under seg selv." };
    }

    if (newParent !== null) {
      const ancestors = await ancestorIds(newParent);
      if (ancestors.includes(input.id) || newParent === input.id) {
        return { ok: false, error: "Sirkulær flytting ikke tillatt." };
      }
      // Make sure new parent exists.
      const exists = await prisma.category.findUnique({
        where: { id: newParent },
        select: { id: true },
      });
      if (!exists) {
        return { ok: false, error: "Ny foreldrekategori finnes ikke." };
      }
    }

    // Depth check — must allow the moving node's whole subtree to fit.
    // For simplicity here we just check the new parent's depth + 1; a
    // subtree spanning many levels could still exceed the limit. v1
    // accepts this trade-off; admin sees the error after the fact.
    const depth = await validateCategoryDepth(newParent);
    if (!depth.valid) {
      return { ok: false, error: "Maks dybde ville bli overskredet." };
    }

    data.parent = newParent
      ? { connect: { id: newParent } }
      : { disconnect: true };
  }

  if (Object.keys(data).length === 0) {
    return { ok: true };
  }

  await prisma.category.update({ where: { id: input.id }, data });

  revalidatePath("/admin/kategorier");
  revalidatePath("/", "layout");

  return { ok: true };
}

// ─── deleteCategoryAction ─────────────────────────────────────────────────

/**
 * Delete a category. Refuses if the category has children OR products.
 * Admin must move children/products elsewhere first.
 */
export async function deleteCategoryAction(
  id: string
): Promise<CategoryActionResult> {
  await requireRole(UserRole.STORE_MANAGER);

  const [childCount, productCount] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.product.count({ where: { categoryId: id } }),
  ]);

  if (childCount > 0) {
    return {
      ok: false,
      error: `Kan ikke slette: kategorien har ${childCount} underkategorier. Flytt dem først.`,
      code: "HAS_CHILDREN",
    };
  }

  if (productCount > 0) {
    return {
      ok: false,
      error: `Kan ikke slette: ${productCount} produkter er tilknyttet. Flytt dem først.`,
      code: "HAS_PRODUCTS",
    };
  }

  await prisma.category.delete({ where: { id } });

  revalidatePath("/admin/kategorier");
  revalidatePath("/", "layout");

  return { ok: true };
}

// ─── reorderCategoriesAction ──────────────────────────────────────────────

/**
 * Bulk-update displayOrder for a set of siblings. Caller is responsible
 * for ensuring all entries share the same parent — this action does
 * NOT validate that.
 */
export async function reorderCategoriesAction(
  updates: ReorderEntry[]
): Promise<CategoryActionResult> {
  await requireRole(UserRole.STORE_MANAGER);

  if (updates.length === 0) return { ok: true };

  await prisma.$transaction(
    updates.map((u) =>
      prisma.category.update({
        where: { id: u.id },
        data: { displayOrder: u.displayOrder },
      })
    )
  );

  revalidatePath("/admin/kategorier");
  revalidatePath("/", "layout");

  return { ok: true };
}

// ─── Read helper for admin UI ─────────────────────────────────────────────

/**
 * Tree of categories with product counts attached to each node. Used by
 * /admin/kategorier so admins can see at a glance which categories are
 * empty.
 */
export interface AdminCategoryNode extends CategoryNode {
  productCount: number;
  children: AdminCategoryNode[];
}

export async function listCategoriesWithCounts(): Promise<AdminCategoryNode[]> {
  await requireRole(UserRole.STORE_MANAGER);

  const [flat, products] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        displayOrder: true,
      },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.product.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
    }),
  ]);

  const productCounts = new Map<string, number>();
  for (const row of products) {
    if (row.categoryId) productCounts.set(row.categoryId, row._count._all);
  }

  const tree = buildCategoryTree(flat) as AdminCategoryNode[];

  function annotate(nodes: AdminCategoryNode[]): void {
    for (const node of nodes) {
      node.productCount = productCounts.get(node.id) ?? 0;
      annotate(node.children);
    }
  }
  annotate(tree);

  return tree;
}
