"use server";

/**
 * SavedMachine server actions — Phase 0.7
 *
 * Per-user "Mine maskiner". Each entry pins a MachineModel so the
 * storefront filter bar can offer one-click filtering to products
 * that fit it.
 *
 * Cap per profile: 20 saved machines (decision in v4.1 plan).
 *
 * Ownership: every write requires an authenticated user; the
 * profile id comes from the session, never from the input. No
 * profileId parameter in any action signature.
 */

import { prisma } from "@/lib/prisma";
import { getProfile } from "@/lib/auth";
import { Prisma } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";

const MAX_SAVED_MACHINES = 20;

export type SavedMachineResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string; code?: string };

interface AddInput {
  modelId: string;
  label?: string;
  serialNumber?: string;
}

interface UpdateInput {
  id: string;
  label?: string | null;
  serialNumber?: string | null;
}

// ─── List ────────────────────────────────────────────────────────────────────

export interface SavedMachineRow {
  id: string;
  modelId: string;
  modelName: string;
  makeId: string;
  makeName: string;
  type: string;
  label: string | null;
  serialNumber: string | null;
  createdAt: Date;
}

export async function listSavedMachinesAction(): Promise<SavedMachineRow[]> {
  const profile = await getProfile();
  const rows = await prisma.savedMachine.findMany({
    where: { profileId: profile.id },
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
    modelName: r.model.name,
    makeId: r.model.makeId,
    makeName: r.model.make.name,
    type: r.model.type as string,
    label: r.label,
    serialNumber: r.serialNumber,
    createdAt: r.createdAt,
  }));
}

// ─── Add ─────────────────────────────────────────────────────────────────────

export async function addSavedMachineAction(
  input: AddInput
): Promise<SavedMachineResult<{ id: string }>> {
  const profile = await getProfile();

  if (!input.modelId?.trim()) {
    return { ok: false, error: "Modell er påkrevd." };
  }

  const count = await prisma.savedMachine.count({
    where: { profileId: profile.id },
  });
  if (count >= MAX_SAVED_MACHINES) {
    return {
      ok: false,
      error: `Du har nådd grensen på ${MAX_SAVED_MACHINES} lagrede maskiner.`,
      code: "LIMIT_REACHED",
    };
  }

  const model = await prisma.machineModel.findUnique({
    where: { id: input.modelId },
    select: { id: true },
  });
  if (!model) {
    return { ok: false, error: "Ukjent modell.", code: "MODEL_NOT_FOUND" };
  }

  try {
    const created = await prisma.savedMachine.create({
      data: {
        profileId: profile.id,
        modelId: input.modelId,
        label: input.label?.trim() || null,
        serialNumber: input.serialNumber?.trim() || null,
      },
      select: { id: true },
    });
    revalidatePath("/konto/mine-maskiner");
    revalidatePath("/produkter");
    return { ok: true, data: created };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        error: "Du har allerede denne modellen lagret.",
        code: "ALREADY_SAVED",
      };
    }
    throw err;
  }
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateSavedMachineAction(
  input: UpdateInput
): Promise<SavedMachineResult> {
  const profile = await getProfile();

  // Ownership check before update
  const existing = await prisma.savedMachine.findUnique({
    where: { id: input.id },
    select: { profileId: true },
  });
  if (!existing) return { ok: false, error: "Ikke funnet." };
  if (existing.profileId !== profile.id) {
    return { ok: false, error: "Ikke autorisert.", code: "FORBIDDEN" };
  }

  const data: Prisma.SavedMachineUpdateInput = {};
  if (input.label !== undefined) {
    data.label = input.label?.trim() || null;
  }
  if (input.serialNumber !== undefined) {
    data.serialNumber = input.serialNumber?.trim() || null;
  }

  await prisma.savedMachine.update({
    where: { id: input.id },
    data,
  });
  revalidatePath("/konto/mine-maskiner");
  return { ok: true };
}

// ─── Remove ──────────────────────────────────────────────────────────────────

export async function removeSavedMachineAction(
  id: string
): Promise<SavedMachineResult> {
  const profile = await getProfile();

  const existing = await prisma.savedMachine.findUnique({
    where: { id },
    select: { profileId: true },
  });
  if (!existing) return { ok: true }; // already gone — idempotent
  if (existing.profileId !== profile.id) {
    return { ok: false, error: "Ikke autorisert.", code: "FORBIDDEN" };
  }

  await prisma.savedMachine.delete({ where: { id } });
  revalidatePath("/konto/mine-maskiner");
  revalidatePath("/produkter");
  return { ok: true };
}
