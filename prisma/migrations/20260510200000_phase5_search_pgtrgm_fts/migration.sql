-- Phase 5 — Search (pg_trgm + FTS)
--
-- Adds two computed columns on Product, kept in sync by a trigger:
--   * searchKey    — lowercase, dashes/spaces stripped from sku + partNumber
--                    + name. Used for exact lookup (B-tree) and trigram
--                    fuzzy match (GIN with gin_trgm_ops).
--   * searchVector — tsvector built from name / sku / partNumber / brand,
--                    weighted A/B/C/D so name and SKU rank above brand.
--
-- Backfill is built into the migration so existing rows acquire the new
-- columns immediately. No data is lost; columns are nullable.

-- 1. Trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Columns (nullable; trigger fills them)
ALTER TABLE "Product"
    ADD COLUMN "searchKey"    TEXT,
    ADD COLUMN "searchVector" tsvector;

-- 3. Trigger function — recomputes both columns from the row's source fields
--    on every INSERT and UPDATE. Stable, IMMUTABLE-ish (depends only on
--    NEW.* values).
CREATE OR REPLACE FUNCTION product_search_refresh() RETURNS trigger AS $$
BEGIN
    -- searchKey: collapse case + non-alphanumeric noise so "ABC-123" and
    -- "abc 123" hit the same row.
    NEW."searchKey" := lower(
        regexp_replace(
            coalesce(NEW.sku,         '') || ' ' ||
            coalesce(NEW."partNumber", '') || ' ' ||
            coalesce(NEW.name,         ''),
            '[^a-z0-9]+', '', 'gi'
        )
    );

    -- searchVector: weighted FTS. Weights:
    --   A = name (top relevance)
    --   B = sku + partNumber (exact identifiers)
    --   C = brand
    --   D = nothing (reserved for shortDescription if added later)
    NEW."searchVector" :=
        setweight(to_tsvector('simple', coalesce(NEW.name,         '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.sku,          '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW."partNumber", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.brand,        '')), 'C');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_refresh_trigger
    BEFORE INSERT OR UPDATE OF sku, "partNumber", name, brand
    ON "Product"
    FOR EACH ROW EXECUTE FUNCTION product_search_refresh();

-- 4. Backfill existing rows — fires the trigger by no-op-touching every row.
--    Touch isActive (a no-op self-update) so the BEFORE UPDATE trigger runs
--    without changing any source data.
UPDATE "Product" SET "isActive" = "isActive";

-- 5. Indexes
--    GIN on searchVector for FTS rank queries (@@).
--    GIN on searchKey with gin_trgm_ops for trigram similarity (% / SIMILARITY).
--    B-tree on searchKey for exact lookups (= / IN).
CREATE INDEX "Product_searchVector_idx"     ON "Product" USING GIN ("searchVector");
CREATE INDEX "Product_searchKey_trgm_idx"   ON "Product" USING GIN ("searchKey" gin_trgm_ops);
CREATE INDEX "Product_searchKey_btree_idx"  ON "Product" ("searchKey");
