-- 2026-06-24 — OEM catalog: add legacy cross-reference, new sources, fitment table.
--
-- 1) OemPart.legacyPartNumber (nullable) — backfilled from sku_legacy_modern_map.json
-- 2) OemCatalogSource enum: + WEIDEMANN_ESERVICE, + LSENGINEERS
-- 3) OemPartCompatibility — fitment data from DHS + LS Engineers + future sources
--
-- Idempotent? No (DDL ops). Apply once per environment.

-- ─── 1. OemPart.legacyPartNumber ─────────────────────────────────────────────
ALTER TABLE "OemPart" ADD COLUMN "legacyPartNumber" TEXT;
CREATE INDEX "OemPart_legacyPartNumber_idx" ON "OemPart"("legacyPartNumber");

-- ─── 2. OemCatalogSource enum — add new values ──────────────────────────────
-- Postgres requires separate transactions for ADD VALUE on enums in some
-- versions; we issue them sequentially. Both are idempotent via IF NOT EXISTS.
ALTER TYPE "OemCatalogSource" ADD VALUE IF NOT EXISTS 'WEIDEMANN_ESERVICE';
ALTER TYPE "OemCatalogSource" ADD VALUE IF NOT EXISTS 'LSENGINEERS';

-- ─── 3. OemPartCompatibility table ──────────────────────────────────────────
CREATE TABLE "OemPartCompatibility" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "machineModel" TEXT,
    "machineName" TEXT,
    "machineNumbers" TEXT[],
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OemPartCompatibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OemPartCompatibility_partNumber_machineModel_source_key"
    ON "OemPartCompatibility"("partNumber", "machineModel", "source");
CREATE INDEX "OemPartCompatibility_partNumber_idx"
    ON "OemPartCompatibility"("partNumber");
CREATE INDEX "OemPartCompatibility_machineModel_idx"
    ON "OemPartCompatibility"("machineModel");
CREATE INDEX "OemPartCompatibility_source_idx"
    ON "OemPartCompatibility"("source");
