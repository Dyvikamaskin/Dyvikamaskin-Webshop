-- Phase 7 — Returns + Quotes
--
-- Adds two new pairs of models:
--   ReturnRequest + ReturnItem  (Forbrukerkjøpsloven §15-17 + §22 angrerett)
--   Quote + QuoteItem           (B2B RFQ flow)
--
-- Plus four enums (ReturnRequestStatus, ReturnReason, QuoteStatus, and the
-- relation Sale ↔ ConvertedQuote that's implemented via Sale.convertedSaleId
-- pointing in the opposite direction).
--
-- All additive. No data backfill needed.

-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED');
CREATE TYPE "ReturnReason" AS ENUM ('WRONG_ITEM', 'DEFECTIVE', 'NOT_AS_DESCRIBED', 'DAMAGED_IN_TRANSIT', 'CHANGED_MIND', 'OTHER');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- ─── ReturnRequest ────────────────────────────────────────────────────────────

CREATE TABLE "ReturnRequest" (
    "id"                   TEXT NOT NULL,
    "saleId"               TEXT NOT NULL,
    "customerId"           TEXT,
    "reason"               "ReturnReason" NOT NULL,
    "notes"                TEXT,
    "adminNotes"           TEXT,
    "status"               "ReturnRequestStatus" NOT NULL DEFAULT 'PENDING',
    "refundAmount"         DECIMAL(65, 30),
    "vippsRefundReference" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt"           TIMESTAMP(3),
    "receivedAt"           TIMESTAMP(3),
    "refundedAt"           TIMESTAMP(3),
    "rejectedAt"           TIMESTAMP(3),

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReturnRequest_saleId_idx"             ON "ReturnRequest"("saleId");
CREATE INDEX "ReturnRequest_customerId_idx"         ON "ReturnRequest"("customerId");
CREATE INDEX "ReturnRequest_status_createdAt_idx"   ON "ReturnRequest"("status", "createdAt");

ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── ReturnItem ───────────────────────────────────────────────────────────────

CREATE TABLE "ReturnItem" (
    "id"              TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "saleItemId"      TEXT NOT NULL,
    "quantity"        INTEGER NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReturnItem_returnRequestId_saleItemId_key"
    ON "ReturnItem"("returnRequestId", "saleItemId");

ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey"
    FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_saleItemId_fkey"
    FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Quote ────────────────────────────────────────────────────────────────────

CREATE TABLE "Quote" (
    "id"               TEXT NOT NULL,
    "quoteNumber"      TEXT NOT NULL,
    "customerId"       TEXT,
    "customerEmail"    TEXT NOT NULL,
    "customerName"     TEXT,
    "customerCompany"  TEXT,
    "storeId"          TEXT NOT NULL,
    "status"           "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalExclMva"  DECIMAL(65, 30) NOT NULL,
    "mvaAmount"        DECIMAL(65, 30) NOT NULL,
    "totalPrice"       DECIMAL(65, 30) NOT NULL,
    "validUntil"       TIMESTAMP(3),
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "sentAt"           TIMESTAMP(3),
    "acceptedAt"       TIMESTAMP(3),
    "rejectedAt"       TIMESTAMP(3),
    "convertedSaleId"  TEXT,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quote_quoteNumber_key"         ON "Quote"("quoteNumber");
CREATE UNIQUE INDEX "Quote_convertedSaleId_key"     ON "Quote"("convertedSaleId");
CREATE INDEX        "Quote_status_createdAt_idx"    ON "Quote"("status", "createdAt");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_convertedSaleId_fkey"
    FOREIGN KEY ("convertedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── QuoteItem ────────────────────────────────────────────────────────────────

CREATE TABLE "QuoteItem" (
    "id"               TEXT NOT NULL,
    "quoteId"          TEXT NOT NULL,
    "productId"        TEXT NOT NULL,
    "sku"              TEXT NOT NULL,
    "productName"      TEXT NOT NULL,
    "quantity"         INTEGER NOT NULL,
    "unitPriceExclMva" DECIMAL(65, 30) NOT NULL,
    "mvaRate"          DECIMAL(65, 30) NOT NULL,
    "lineTotalExclMva" DECIMAL(65, 30) NOT NULL,
    "lineTotalInclMva" DECIMAL(65, 30) NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Apply RLS to the new tables (Phase 6 defence-in-depth pattern) ──────────

DO $$
DECLARE r TEXT;
BEGIN
    FOR r IN SELECT unnest(ARRAY['ReturnRequest', 'ReturnItem', 'Quote', 'QuoteItem']) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
            r || '_service_role_all', r
        );
    END LOOP;
END $$;
