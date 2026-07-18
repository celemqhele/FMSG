-- Track discount redemptions to enforce one-time discounts

CREATE TABLE IF NOT EXISTS discount_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discount_type TEXT NOT NULL,
  discount_percent INTEGER NOT NULL,
  paystack_reference TEXT,
  plan_purchased TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One redemption per user per discount type
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_redemptions_user_type
  ON discount_redemptions(user_id, discount_type);

ALTER TABLE discount_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON discount_redemptions
  USING (auth.role() = 'service_role');
