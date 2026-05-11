"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma/enums";

export type SaveBackupKeyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Save the admin's age public key on Profile.backupPublicKey. The
 * matching private key never leaves the admin's browser.
 *
 * Validation: the recipient must look like an age public key (starts
 * with "age1" and is 62 chars total — bech32 encoding of an X25519
 * pubkey). We do not call out to the age library here to verify the
 * checksum; the actual encrypt() in the download route will fail loudly
 * if it's malformed, and that's the load-bearing check.
 */
export async function saveBackupPublicKeyAction(
  publicKey: string,
): Promise<SaveBackupKeyResult> {
  let admin: Awaited<ReturnType<typeof requireRole>>;
  try {
    admin = await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { ok: false, error: "Bare SUPER_ADMIN kan registrere sikkerhetskopinøkkel." };
  }

  const trimmed = publicKey.trim();
  if (!/^age1[0-9a-z]{55,75}$/.test(trimmed)) {
    return {
      ok: false,
      error: "Ugyldig age-nøkkel — forventet format begynner med 'age1'.",
    };
  }

  const previous = await prisma.profile.findUnique({
    where: { id: admin.id },
    select: { backupPublicKey: true },
  });

  await prisma.profile.update({
    where: { id: admin.id },
    data: { backupPublicKey: trimmed },
  });

  await logAudit(
    admin.id,
    previous?.backupPublicKey ? "BACKUP_KEY_ROTATED" : "BACKUP_KEY_REGISTERED",
    "Profile",
    admin.id,
    previous?.backupPublicKey ? { hadPreviousKey: true } : null,
    { newKey: trimmed.slice(0, 16) + "…" },
  );

  revalidatePath("/admin");
  revalidatePath("/admin/backup/setup");
  return { ok: true };
}

// ─── Manual backup trigger (verification button on /admin/backup/setup) ──────

export type TriggerBackupResult =
  | { ok: true; jobId: string; triggeredAt: string }
  | { ok: false; error: string };

/**
 * Enqueues a one-off `daily-backup` job to the maintenance queue —
 * same path the 02:00 UTC cron uses, just fired on demand. Lets a
 * SUPER_ADMIN verify their `backupPublicKey` actually produces a
 * successful artifact without waiting for the next scheduled tick.
 *
 * Fails fast if no key is set (the worker would return SKIPPED anyway,
 * but surfacing it here avoids a confusing "started job that did
 * nothing" round-trip).
 *
 * Returns `{ jobId, triggeredAt }` so the client can poll
 * `getRecentBackupStatusAction()` for the resulting BackupRun row.
 */
export async function triggerBackupNowAction(): Promise<TriggerBackupResult> {
  let admin: Awaited<ReturnType<typeof requireRole>>;
  try {
    admin = await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { ok: false, error: "Bare SUPER_ADMIN kan starte sikkerhetskopi." };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: admin.id },
    select: { backupPublicKey: true },
  });
  if (!profile?.backupPublicKey) {
    return {
      ok: false,
      error:
        "Ingen krypteringsnøkkel registrert. Generer nøkkel over først.",
    };
  }

  const triggeredAt = new Date().toISOString();
  const { enqueueMaintenanceJob } = await import("@/lib/queue/maintenance");
  const jobId = await enqueueMaintenanceJob({ kind: "daily-backup" });

  await logAudit(
    admin.id,
    "BACKUP_TRIGGERED_MANUAL",
    "BackupRun",
    jobId,
    null,
    { triggeredAt },
  );

  return { ok: true, jobId, triggeredAt };
}

export type BackupStatusSnapshot = {
  id:           string;
  status:       "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  startedAt:    string;
  finishedAt:   string | null;
  bytesWritten: number | null;
  storagePath:  string | null;
  errorMessage: string | null;
};

/**
 * Returns the most recent BackupRun started at-or-after the given
 * timestamp. The trigger action returns `triggeredAt`; the client polls
 * this with the same value to find the row the worker just wrote.
 *
 * Returns `null` if no row has appeared yet — the client treats this as
 * "still queued / not yet picked up" and tries again.
 */
export async function getRecentBackupStatusAction(
  triggeredAt: string,
): Promise<{ ok: true; run: BackupStatusSnapshot | null } | { ok: false; error: string }> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { ok: false, error: "Bare SUPER_ADMIN kan se sikkerhetskopistatus." };
  }

  const since = new Date(triggeredAt);
  if (isNaN(since.getTime())) {
    return { ok: false, error: "Ugyldig tidsstempel." };
  }

  const run = await prisma.backupRun.findFirst({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      bytesWritten: true,
      storagePath: true,
      errorMessage: true,
    },
  });

  if (!run) return { ok: true, run: null };

  return {
    ok: true,
    run: {
      id:           run.id,
      status:       run.status,
      startedAt:    run.startedAt.toISOString(),
      finishedAt:   run.finishedAt?.toISOString() ?? null,
      bytesWritten: run.bytesWritten ?? null,
      storagePath:  run.storagePath ?? null,
      errorMessage: run.errorMessage ?? null,
    },
  };
}
