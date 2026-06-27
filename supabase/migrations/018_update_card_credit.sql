-- Migration 018: R1 credit tracking for card update verification charges

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS update_card_credit INTEGER DEFAULT 0;
