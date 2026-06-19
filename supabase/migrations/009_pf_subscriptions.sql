-- ============================================================
-- Migration 009: Persistent Finder + Paystack Subscriptions
-- ============================================================

-- 1. PROFILES additions
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS persistent_finder_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_last_refill TIMESTAMPTZ;

-- 2. SUBSCRIPTIONS additions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paystack_subscription_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS plan_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS authorization_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paystack_subscription_id ON subscriptions(paystack_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
