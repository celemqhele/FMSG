-- Migration 017: Tokenized Charge API support
-- Adds failure tracking for cron-based billing retries

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS failed_charge_count INTEGER DEFAULT 0;
