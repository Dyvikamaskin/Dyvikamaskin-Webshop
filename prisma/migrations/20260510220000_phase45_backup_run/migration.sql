-- Phase 4.5 follow-up — automatic daily backup audit table
--
-- Adds a BackupRun row per scheduled (or manual) backup attempt. The
-- maintenance queue's daily-backup job writes one row per tick. The
-- encrypted artifact lives in Supabase Storage at `storagePath`.

CREATE TYPE "BackupRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

CREATE TABLE "BackupRun" (
    "id"           TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"   TIMESTAMP(3),
    "status"       "BackupRunStatus" NOT NULL DEFAULT 'RUNNING',
    "recipientKey" TEXT,
    "storagePath"  TEXT,
    "bytesWritten" INTEGER,
    "errorMessage" TEXT,
    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");
CREATE INDEX "BackupRun_status_idx"    ON "BackupRun"("status");
