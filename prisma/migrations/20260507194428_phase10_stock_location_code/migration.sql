-- Phase 10: Warehouse location codes
--
-- Adds a structured, hierarchical location code to StoreStock.
-- Format: ZONE-AISLE-RACK-SHELF-SLOT  (e.g. "PLUKK-A-01-B-03")
--
-- The unique index enforces one product per physical slot per store.
-- PostgreSQL's UNIQUE index allows multiple NULL values, so unset codes
-- do not conflict with each other.

ALTER TABLE "StoreStock" ADD COLUMN "locationCode" TEXT;

CREATE UNIQUE INDEX "StoreStock_storeId_locationCode_key"
  ON "StoreStock"("storeId", "locationCode");
