-- Add next_plan column to profiles for scheduled downgrades
-- When a user downgrades, the plan switch happens at the end of the billing cycle.
-- The webhook reads this column on subscription.disable to apply the change.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_plan TEXT;

-- Track which subscription code was used so the webhook can correlate
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
