/**
 * Read helpers for SavedMachine — Phase 0.7
 *
 * Used by the storefront filter bar to surface "Mine maskiner" chips.
 * Returns an empty list for unauthenticated users — never throws or
 * redirects (the filter bar must work for guests too).
 */

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export interface SavedMachineForFilter {
  id: string;
  modelId: string;
  makeId: string;
  /** Display label — user nickname if set, otherwise "Make Model". */
  label: string;
}

export async function getSavedMachinesForFilter(): Promise<SavedMachineForFilter[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const rows = await prisma.savedMachine.findMany({
    where: { profileId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      model: {
        include: { make: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    modelId: r.modelId,
    makeId: r.model.makeId,
    label: r.label?.trim() || `${r.model.make.name} ${r.model.name}`,
  }));
}
