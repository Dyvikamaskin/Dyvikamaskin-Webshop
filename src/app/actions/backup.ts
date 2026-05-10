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
