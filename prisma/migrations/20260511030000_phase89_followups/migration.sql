-- Phase 7/8/9 follow-ups
--
-- 1. DiscountSource.FIXED_PRICE — distinguishes a CustomerPriceList
--    PRODUCT-scope fixedPrice from a regular customer-discount percent.
--    Audit / regnskap can now read off the source cleanly.
--
-- Pure enum-value addition; safe on existing rows because no Sale row
-- has FIXED_PRICE today.

ALTER TYPE "DiscountSource" ADD VALUE 'FIXED_PRICE';
