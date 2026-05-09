import { prisma } from "@/lib/prisma";
import { getCategoryTree } from "@/lib/categories";
import TopBar from "@/components/layout/TopBar";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import CategoryDrawer, {
  type MachineMakeNode,
} from "@/components/layout/CategoryDrawer";

/**
 * StoreHeader — Phase 0.5
 *
 * Composes the new three-row chrome (reference: tools.no):
 *   1. TopBar       — hamburger | logo | search | scanner | account | cart
 *   2. PrimaryNav   — horizontal nav + lager picker (md+)
 *   3. CategoryDrawer — slide-out left drawer (closed by default)
 *
 * Server component. Fetches the category tree and machine-make list once
 * per page so the drawer can render its multi-pane drilldown without
 * client-side data fetching.
 */
export default async function StoreHeader() {
  const [categoryTree, makesRaw] = await Promise.all([
    getCategoryTree(),
    prisma.machineMake.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { models: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const machineMakes: MachineMakeNode[] = makesRaw.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    modelCount: m._count.models,
  }));

  return (
    <header className="sticky top-0 z-30">
      <TopBar />
      <PrimaryNav />
      <CategoryDrawer
        categoryTree={categoryTree}
        machineMakes={machineMakes}
      />
    </header>
  );
}
