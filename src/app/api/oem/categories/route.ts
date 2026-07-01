import { NextResponse } from "next/server";
import { oemPrisma } from "@/lib/oem-db";

export type MachineVariant = {
  id: string;
  code: string;
  displayName: string;
  modelName: string;
  isDiscontinued: boolean;
  diagramCount: number;
  revisionCount: number;
};

export type ModelGroup = {
  displayName: string;
  variants: MachineVariant[];
};

export type SubCategory = {
  name: string;
  models: ModelGroup[];
};

export type TopGroup = {
  name: string;
  subCategories: SubCategory[];
};

export async function GET() {
  const machines = await oemPrisma.machine.findMany({
    where: {
      source: "EPARTS_API",
      parentMachineId: null,
      categoryPath: { not: null },
    },
    select: {
      id: true,
      code: true,
      displayName: true,
      modelName: true,
      categoryPath: true,
      isDiscontinued: true,
      _count: { select: { revisions: true } },
      revisions: {
        select: { _count: { select: { diagrams: true } } },
      },
    },
    orderBy: [{ isDiscontinued: "asc" }, { displayName: "asc" }],
  });

  const withBom = machines.filter((m) =>
    m.revisions.some((r) => r._count.diagrams > 0)
  );

  // topGroup → subCat → modelName → variants
  const topMap = new Map<string, Map<string, Map<string, MachineVariant[]>>>();

  for (const m of withBom) {
    const path = m.categoryPath as string[] | null;
    const topGroup = path?.[0] ?? "Other";
    const subCat = path?.[1] ?? topGroup;
    const diagramCount = m.revisions.reduce((sum, r) => sum + r._count.diagrams, 0);

    if (!topMap.has(topGroup)) topMap.set(topGroup, new Map());
    const subMap = topMap.get(topGroup)!;

    if (!subMap.has(subCat)) subMap.set(subCat, new Map());
    const modelMap = subMap.get(subCat)!;

    if (!modelMap.has(m.displayName)) modelMap.set(m.displayName, []);
    modelMap.get(m.displayName)!.push({
      id: m.id,
      code: m.code,
      displayName: m.displayName,
      modelName: m.modelName,
      isDiscontinued: m.isDiscontinued,
      diagramCount,
      revisionCount: m._count.revisions,
    });
  }

  const TOP_GROUP_ORDER = [
    "Compaction", "Concrete Technology", "Demolition",
    "Excavators", "Compact Equipment", "Pumps",
    "Power & Lighting", "Heating", "Accessories", "Other",
  ];

  const result: TopGroup[] = Array.from(topMap.entries())
    .map(([topName, subMap]) => ({
      name: topName,
      subCategories: Array.from(subMap.entries())
        .map(([subName, modelMap]) => ({
          name: subName,
          models: Array.from(modelMap.entries())
            .map(([displayName, variants]) => ({ displayName, variants }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const ai = TOP_GROUP_ORDER.indexOf(a.name);
      const bi = TOP_GROUP_ORDER.indexOf(b.name);
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  return NextResponse.json(result);
}
