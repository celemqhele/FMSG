-- FMSG Agents — Supabase Storage & Device Registry Policies (v0.4.0)
-- Run statements ONE AT A TIME in the Supabase Dashboard SQL Editor.

-- 1. Ensure agent-updates bucket exists and is private (public = false)
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-updates', 'agent-updates', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Restrict WRITE (INSERT / UPDATE / DELETE) on agent-updates strictly to admin account
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

-- 3. Allow reading only the signed manifest file; raw bundle files are served encrypted per-device via /api/agent/updates/check
DROP POLICY IF EXISTS "agent_updates_read_signed_manifest" ON storage.objects;
CREATE POLICY "agent_updates_read_signed_manifest"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'agent-updates'
  AND name IN ('manifest.stable.sig.json', 'manifest.beta.sig.json')
);
