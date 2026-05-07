-- Phase 8: Invoice counter table
-- Atomic row-per-year counter for sequential invoice numbers (e.g. "2026-000001").
CREATE TABLE "InvoiceCounter" (
    "year"    INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);
