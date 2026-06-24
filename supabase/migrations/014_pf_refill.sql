-- Add pf_refill column to profiles for tracking user's chosen PF refill count
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pf_refill INTEGER DEFAULT 0;

-- Also add next_pf_refill for scheduled PF changes (like next_plan for downgrades)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_pf_refill INTEGER;
