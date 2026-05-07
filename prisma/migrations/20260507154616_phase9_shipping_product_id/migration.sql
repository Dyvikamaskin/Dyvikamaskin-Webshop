-- Phase 9: Add shippingProductId to Sale
-- Stores the Bring product code selected at checkout (e.g. "PAKKE_TIL_HENTESTED").
ALTER TABLE "Sale" ADD COLUMN "shippingProductId" TEXT;
