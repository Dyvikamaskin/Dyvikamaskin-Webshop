-- Phase 0.7 — Condition / provenance / fitment filters / My Machines
-- Adds:
--   * ProductCondition, ConditionRating, PartProvenance enums
--   * Product.condition, Product.conditionRating, Product.conditionNotes,
--     Product.provenance fields (defaults applied to existing rows)
--   * SavedMachine table for the per-user "Mine maskiner" feature

-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "ConditionRating" AS ENUM ('AS_NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "PartProvenance" AS ENUM ('GENUINE', 'OEM', 'AFTERMARKET');

-- AlterTable
ALTER TABLE "Product"
    ADD COLUMN "condition"       "ProductCondition" NOT NULL DEFAULT 'NEW',
    ADD COLUMN "conditionRating" "ConditionRating",
    ADD COLUMN "conditionNotes"  TEXT,
    ADD COLUMN "provenance"      "PartProvenance"   NOT NULL DEFAULT 'AFTERMARKET';

-- CreateTable
CREATE TABLE "SavedMachine" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT,
    "serialNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedMachine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedMachine_profileId_idx" ON "SavedMachine"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedMachine_profileId_modelId_key" ON "SavedMachine"("profileId", "modelId");

-- AddForeignKey
ALTER TABLE "SavedMachine" ADD CONSTRAINT "SavedMachine_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedMachine" ADD CONSTRAINT "SavedMachine_modelId_fkey"
    FOREIGN KEY ("modelId") REFERENCES "MachineModel"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
