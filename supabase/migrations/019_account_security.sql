-- Account security: IP tracking, email verification, VPN/proxy blocking

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_ip TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verification_hash TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS blocked_ips (
  ip TEXT PRIMARY KEY,
  blocked_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);

-- Data API access (new tables need explicit grants since Supabase Oct 30 2026 change)
GRANT ALL ON TABLE public.blocked_ips TO anon, authenticated, service_role;
