-- Phase 14: Add replacesPartNumbers array to Product
ALTER TABLE "Product" ADD COLUMN "replacesPartNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
