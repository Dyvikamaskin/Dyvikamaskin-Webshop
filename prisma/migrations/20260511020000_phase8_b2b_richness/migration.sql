-- Phase 8 — B2B richness
--
-- * Supplier model + Product.preferredSupplierId
-- * CustomerPriceList + CustomerPriceScope enum
-- * Profile.marketingConsentAt (Phase 9 plumbing)
-- * Sale.hasBackorderedItems, SaleItem.expectedAvailableAt
--
-- All additive. No data backfill needed (pricing engine reads
-- CustomerPriceList opportunistically; absence falls back to flat
-- Profile.defaultDiscount semantics).

-- CreateEnum
CREATE TYPE "CustomerPriceScope" AS ENUM ('GLOBAL', 'CATEGORY', 'BRAND', 'PRODUCT');

-- ─── Profile.marketingConsentAt ──────────────────────────────────────────────
ALTER TABLE "Profile" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);

-- ─── Sale + SaleItem backorder fields ────────────────────────────────────────
ALTER TABLE "Sale" ADD COLUMN "hasBackorderedItems" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SaleItem" ADD COLUMN "expectedAvailableAt" TIMESTAMP(3);

-- ─── Supplier ────────────────────────────────────────────────────────────────
CREATE TABLE "Supplier" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "orgNumber"  TEXT,
    "email"      TEXT,
    "phone"      TEXT,
    "address"    TEXT,
    "postalCode" TEXT,
    "city"       TEXT,
    "notes"      TEXT,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product" ADD COLUMN "preferredSupplierId" TEXT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_preferredSupplierId_fkey"
    FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── CustomerPriceList ───────────────────────────────────────────────────────
CREATE TABLE "CustomerPriceList" (
    "id"              TEXT NOT NULL,
    "profileId"       TEXT NOT NULL,
    "scope"           "CustomerPriceScope" NOT NULL,
    "scopeId"         TEXT,
    "discountPercent" DECIMAL(65, 30),
    "fixedPrice"      DECIMAL(65, 30),
    "notes"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPriceList_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerPriceList_profileId_scope_idx" ON "CustomerPriceList"("profileId", "scope");

ALTER TABLE "CustomerPriceList" ADD CONSTRAINT "CustomerPriceList_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── RLS on the new tables (Phase 6 defence-in-depth pattern) ────────────────
DO $$
DECLARE r TEXT;
BEGIN
    FOR r IN SELECT unnest(ARRAY['Supplier', 'CustomerPriceList']) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
            r || '_service_role_all', r
        );
    END LOOP;
END $$;
