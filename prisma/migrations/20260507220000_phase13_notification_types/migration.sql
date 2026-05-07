-- Add new notification types (safe, no table changes needed)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOW_STOCK';
