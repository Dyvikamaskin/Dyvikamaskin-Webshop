-- Phase 3 — Vipps capture-on-dispatch + Stock reservations
--
-- Schema changes:
--   * OrderStatus enum: add AUTHORIZED, REFUNDED, CANCELLED, AWAITING_STOCK
--   * Sale: add vippsReference, authorizedAt, capturedAt, capturedAmount
--   * New StockReservation table for soft-holding stock during checkout
--
-- All additive. No data backfill needed (0 sales in production at the
-- time this was authored — Phase 2 confirmed empty Sale/SaleItem).

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AUTHORIZED';
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_STOCK';

-- AlterTable
ALTER TABLE "Sale"
    ADD COLUMN "vippsReference" TEXT,
    ADD COLUMN "authorizedAt"   TIMESTAMP(3),
    ADD COLUMN "capturedAt"     TIMESTAMP(3),
    ADD COLUMN "capturedAmount" DECIMAL(65, 30);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id"        TEXT NOT NULL,
    "saleId"    TEXT,
    "productId" TEXT NOT NULL,
    "storeId"   TEXT NOT NULL,
    "quantity"  INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockReservation_productId_storeId_expiresAt_idx"
    ON "StockReservation"("productId", "storeId", "expiresAt");

-- CreateIndex
CREATE INDEX "StockReservation_sessionId_idx"
    ON "StockReservation"("sessionId");

-- CreateIndex
CREATE INDEX "StockReservation_expiresAt_idx"
    ON "StockReservation"("expiresAt");

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
