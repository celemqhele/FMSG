-- Migration 037: FMSG Agents device registry table & storage RLS policies
-- Stores non-personal device public keys, IP hashes, and revocation state for update checks.

CREATE TABLE IF NOT EXISTS public.agent_devices (
  device_id text PRIMARY KEY,
  sign_public_key text NOT NULL,
  encrypt_public_key text NOT NULL,
  ip_hash text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_devices_ip_hash ON public.agent_devices (ip_hash);

ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;

-- Required Data API grants (RLS restricts access strictly to service_role)
GRANT ALL ON TABLE public.agent_devices TO anon, authenticated, service_role;

-- Storage bucket & policies for agent-updates
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-updates', 'agent-updates', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "agent_updates_admin_insert" ON storage.objects;
CREATE POLICY "agent_updates_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agent-updates'
  AND (auth.jwt() ->> 'email') = 'mqhele03@gmail.com'
);

DROP POLICY IF EXISTS "agent_updates_admin_update" ON storage.objects;
CREATE POLICY "agent_updates_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'agent-updates'
  AND (auth.jwt() ->> 'email') = 'mqhele03@gmail.com'
)
WITH CHECK (
  bucket_id = 'agent-updates'
  AND (auth.jwt() ->> 'email') = 'mqhele03@gmail.com'
);

DROP POLICY IF EXISTS "agent_updates_admin_delete" ON storage.objects;
CREATE POLICY "agent_updates_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'agent-updates'
  AND (auth.jwt() ->> 'email') = 'mqhele03@gmail.com'
);

DROP POLICY IF EXISTS "agent_updates_read_signed_manifest" ON storage.objects;
CREATE POLICY "agent_updates_read_signed_manifest"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'agent-updates'
  AND name IN ('manifest.stable.sig.json', 'manifest.beta.sig.json')
);
