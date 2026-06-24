-- v4.3 prep: OemPartListing
--
-- Rich per-SKU enrichment data from external retailers (Neyer first).
-- One row per (partNumber, source). Loose join to OemPart.partNumber —
-- not a FK because external sources may have SKUs we don't yet have.

-- CreateTable
CREATE TABLE "OemPartListing" (
    "id"                    TEXT NOT NULL,
    "partNumber"            TEXT NOT NULL,
    "source"                TEXT NOT NULL,
    "title"                 TEXT NOT NULL,
    "description"           TEXT,
    "descriptionHtml"       TEXT,
    "productType"           TEXT,
    "weightGrams"           INTEGER,
    "barcode"               TEXT,
    "replacesPartNumbers"   TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrls"             TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryImageUrl"       TEXT,
    "imageCount"            INTEGER NOT NULL DEFAULT 0,
    "sourceProductId"       TEXT,
    "sourceUrl"             TEXT,
    "sourceCreatedAt"       TIMESTAMP(3),
    "sourceUpdatedAt"       TIMESTAMP(3),
    "price"                 TEXT,
    "currency"              TEXT,
    "scrapedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OemPartListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OemPartListing_partNumber_source_key" ON "OemPartListing"("partNumber", "source");
CREATE INDEX "OemPartListing_partNumber_idx" ON "OemPartListing"("partNumber");
CREATE INDEX "OemPartListing_source_idx" ON "OemPartListing"("source");
CREATE INDEX "OemPartListing_productType_idx" ON "OemPartListing"("productType");
