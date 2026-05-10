/**
 * Daily scheduled backup — Phase 4.5 follow-up
 *
 * Runs every day at 02:00 UTC via the `maintenance` queue. Produces the
 * same age-encrypted SQL dump as the manual `/api/admin/backup/download`
 * route, but uploads the artifact to Supabase Storage instead of
 * streaming to a browser.
 *
 * Recipient selection: today the dump is encrypted to a single
 * SUPER_ADMIN's age public key (the oldest one with a key registered,
 * to keep recipient choice deterministic across runs). Multi-recipient
 * encryption — so any SUPER_ADMIN can decrypt — is a separate
 * follow-up; the storage layout doesn't change when that lands.
 *
 * Storage layout
 *   backups/YYYY/MM/DD/industriparts-{ISO timestamp}.sql.age
 *
 * Retention
 *   30 days. After each successful run, BackupRun rows older than 30
 *   days are pruned and their Storage artifacts are deleted. Pruning
 *   failures are non-fatal — the next successful run will catch up.
 */
import { prisma } from "@/lib/prisma";
import { buildDumpStream } from "@/lib/backup/dump";
import { encryptStream } from "@/lib/backup/age";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { UserRole, BackupRunStatus } from "@/app/generated/prisma/enums";

const BUCKET = "backups";
const RETENTION_DAYS = 30;

export interface ScheduledBackupResult {
  status: BackupRunStatus;
  backupRunId: string;
  storagePath?: string;
  bytesWritten?: number;
  errorMessage?: string;
}

/**
 * Execute one scheduled-backup run. Exported for the BullMQ handler
 * and for the test harness; safe to call manually from a script too.
 */
export async function runScheduledBackup(): Promise<ScheduledBackupResult> {
  // 1. Pick a recipient. Deterministic: oldest SUPER_ADMIN with a key.
  // (Switch to multi-recipient encryption once the matching follow-up
  // lands; the recipient-selection logic moves there.)
  const recipientProfile = await prisma.profile.findFirst({
    where: { role: UserRole.SUPER_ADMIN, backupPublicKey: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, backupPublicKey: true },
  });

  if (!recipientProfile?.backupPublicKey) {
    const run = await prisma.backupRun.create({
      data: {
        status: BackupRunStatus.SKIPPED,
        finishedAt: new Date(),
        errorMessage:
          "No SUPER_ADMIN with backupPublicKey configured. " +
          "Visit /admin/backup/setup to enable automatic backups.",
      },
      select: { id: true },
    });
    return {
      status: BackupRunStatus.SKIPPED,
      backupRunId: run.id,
      errorMessage:
        "No SUPER_ADMIN with backupPublicKey configured. " +
        "Visit /admin/backup/setup to enable automatic backups.",
    };
  }

  const recipient = recipientProfile.backupPublicKey;
  // Truncate to first 20 chars so we can audit *which* key without
  // logging the full public key. (Public keys aren't secret, but
  // truncation also avoids cluttering BackupRun rows.)
  const recipientKeyTruncated = recipient.slice(0, 20);

  // 2. Record the RUNNING row up front. If the process crashes mid-way,
  // a stale RUNNING row left behind is a clear signal that something
  // went wrong (vs. a missing row which could mean the schedule never
  // fired).
  const run = await prisma.backupRun.create({
    data: {
      status: BackupRunStatus.RUNNING,
      recipientKey: recipientKeyTruncated,
    },
    select: { id: true },
  });

  try {
    // 3. Build the encrypted artifact. We buffer the whole stream
    // here because Supabase Storage upload doesn't reliably accept a
    // Web ReadableStream from a Node server context; backups are tiny
    // in early-stage catalogs and Railway gives us plenty of memory.
    // Migrate to streaming upload only if backups grow past ~100 MB.
    const cleartext = buildDumpStream();
    const encrypted = await encryptStream(cleartext, recipient);
    const bytes = await readStreamToBuffer(encrypted);

    // 4. Upload.
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const storagePath = `${yyyy}/${mm}/${dd}/industriparts-${now
      .toISOString()
      .replace(/[:.]/g, "-")}.sql.age`;

    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    // 5. Mark every SUPER_ADMIN's lastBackupAt — the dashboard banner
    // should reflect "automatic backups are alive", not just the manual
    // download timestamp of one admin.
    await prisma.profile.updateMany({
      where: { role: UserRole.SUPER_ADMIN },
      data: { lastBackupAt: now },
    });

    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: BackupRunStatus.SUCCESS,
        finishedAt: now,
        storagePath,
        bytesWritten: bytes.byteLength,
      },
    });

    // 6. Best-effort retention prune. Failure here doesn't fail the
    // overall job — old artifacts can linger an extra day.
    try {
      await pruneOldBackups(RETENTION_DAYS);
    } catch (pruneErr) {
      console.error("[daily-backup] retention prune failed", pruneErr);
    }

    return {
      status: BackupRunStatus.SUCCESS,
      backupRunId: run.id,
      storagePath,
      bytesWritten: bytes.byteLength,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: BackupRunStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    throw err; // surface to BullMQ so reportJobFailure → Sentry fires
  }
}

/**
 * Delete BackupRun rows + their Storage artifacts older than
 * `retentionDays`. Returns the count of rows actually removed.
 */
export async function pruneOldBackups(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const stale = await prisma.backupRun.findMany({
    where: {
      startedAt: { lt: cutoff },
    },
    select: { id: true, storagePath: true },
  });
  if (stale.length === 0) return 0;

  const supabase = getSupabaseAdmin();
  const paths = stale
    .map((r) => r.storagePath)
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      // Log but don't throw — the DB rows can still be deleted; the
      // orphaned Storage objects can be cleaned up manually.
      console.error("[daily-backup] storage remove failed", error);
    }
  }

  await prisma.backupRun.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
  return stale.length;
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function ensureBucket(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<void> {
  // Idempotent: createBucket returns a 409-style error if the bucket
  // exists. We swallow that and only surface other failures.
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Bucket setup failed: ${error.message}`);
  }
}

async function readStreamToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
