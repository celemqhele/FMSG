-- ============================================================
-- Migration 010: Unique constraint on paystack_reference
-- ============================================================

-- Remove duplicate rows keeping only the first one per reference
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY paystack_reference ORDER BY created_at ASC
    ) AS rn
    FROM subscriptions
    WHERE paystack_reference IS NOT NULL AND paystack_reference != ''
  ) dup
  WHERE dup.rn > 1
);

-- Add unique partial index (ignores NULL and empty references)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paystack_reference_unique
  ON subscriptions(paystack_reference)
  WHERE paystack_reference IS NOT NULL AND paystack_reference != '';
