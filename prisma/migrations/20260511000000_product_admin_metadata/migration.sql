-- Admin-only product metadata
--
-- Three fields that are NEVER exposed via the storefront PRODUCT_SELECT:
--   purchasePrice     — cost-of-goods-sold for margin reports
--   tags              — free-form internal categorisation
--   hiddenDescription — internal notes (supplier quirks, picking instructions)
--
-- All nullable / default-empty so the migration is additive on existing
-- product rows (0 products currently — migration is effectively a no-op
-- against the data, but the columns are needed for new INSERT paths).

ALTER TABLE "Product"
    ADD COLUMN "purchasePrice"     DECIMAL(65, 30),
    ADD COLUMN "tags"              TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN "hiddenDescription" TEXT;
