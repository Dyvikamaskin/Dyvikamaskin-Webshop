-- Phase 4.5 — Local-disk backup MVP
--
-- Two nullable Profile columns. Both are populated only for SUPER_ADMINs
-- who have completed /admin/backup/setup. The matching age private key
-- is downloaded once during setup and never persisted server-side.

ALTER TABLE "Profile"
    ADD COLUMN "backupPublicKey" TEXT,
    ADD COLUMN "lastBackupAt"    TIMESTAMP(3);
