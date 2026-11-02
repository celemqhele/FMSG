-- Migration 038: Zero-PII Device Challenge-Response & OTA Update Verification RPC
-- Links random device keys without any hardware IDs, serial numbers, MACs, usernames, or machine names.

ALTER TABLE public.agent_devices
  ADD COLUMN IF NOT EXISTS os_version text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS arch text,
  ADD COLUMN IF NOT EXISTS active_challenge text,
  ADD COLUMN IF NOT EXISTS challenge_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.issue_agent_device_challenge(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_challenge text;
  v_expires timestamptz;
BEGIN
  IF p_device_id IS NULL OR length(trim(p_device_id)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_device_id');
  END IF;

  v_challenge := 'ch_' || encode(gen_random_bytes(24), 'hex') || '_' || extract(epoch from now())::bigint::text;
  v_expires := now() + interval '2 minutes';

  UPDATE public.agent_devices
  SET active_challenge = v_challenge,
      challenge_expires_at = v_expires
  WHERE device_id = p_device_id;

  RETURN jsonb_build_object(
    'ok', true,
    'challenge', v_challenge,
    'expires_at', v_expires
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_agent_device_challenge(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_or_register_agent_device(
  p_device_id text,
  p_sign_public_key text,
  p_encrypt_public_key text,
  p_challenge text,
  p_signature text,
  p_os_version text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_arch text DEFAULT NULL,
  p_auto_register boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_headers jsonb;
  v_raw_ip text;
  v_ip_hash text;
  v_existing record;
  v_ip_count integer;
BEGIN
  IF p_device_id IS NULL OR p_sign_public_key IS NULL OR p_encrypt_public_key IS NULL OR p_challenge IS NULL OR p_signature IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_parameters');
  END IF;

  IF length(p_signature) < 32 OR length(p_challenge) < 12 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_signature_format');
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_raw_ip := coalesce(
      split_part(v_headers->>'x-forwarded-for', ',', 1),
      v_headers->>'x-real-ip',
      '0.0.0.0'
    );
  EXCEPTION WHEN OTHERS THEN
    v_raw_ip := '0.0.0.0';
  END;

  v_ip_hash := substr(encode(digest('fmsg-dev-ip:' || trim(v_raw_ip), 'sha256'), 'hex'), 1, 24);

  SELECT * INTO v_existing
  FROM public.agent_devices
  WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    IF NOT p_auto_register THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'unknown_device');
    END IF;

    SELECT count(*) INTO v_ip_count
    FROM public.agent_devices
    WHERE ip_hash = v_ip_hash
      AND created_at > now() - interval '1 hour';

    IF v_ip_count >= 25 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited');
    END IF;

    INSERT INTO public.agent_devices (
      device_id,
      sign_public_key,
      encrypt_public_key,
      ip_hash,
      revoked,
      os_version,
      app_version,
      arch,
      active_challenge,
      challenge_expires_at
    ) VALUES (
      p_device_id,
      p_sign_public_key,
      p_encrypt_public_key,
      v_ip_hash,
      false,
      p_os_version,
      p_app_version,
      p_arch,
      null,
      null
    );

    RETURN jsonb_build_object('allowed', true, 'registered', true, 'newly_registered', true);
  END IF;

  IF v_existing.revoked THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'device_revoked');
  END IF;

  IF trim(v_existing.sign_public_key) <> trim(p_sign_public_key) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'public_key_mismatch');
  END IF;

  IF v_existing.active_challenge IS NOT NULL THEN
    IF v_existing.active_challenge <> p_challenge THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'challenge_mismatch');
    END IF;
    IF v_existing.challenge_expires_at IS NOT NULL AND v_existing.challenge_expires_at < now() THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'challenge_expired');
    END IF;
  END IF;

  UPDATE public.agent_devices
  SET last_seen_at = now(),
      os_version = coalesce(p_os_version, os_version),
      app_version = coalesce(p_app_version, app_version),
      arch = coalesce(p_arch, arch),
      active_challenge = null,
      challenge_expires_at = null
  WHERE device_id = p_device_id;

  RETURN jsonb_build_object('allowed', true, 'registered', true, 'newly_registered', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_or_register_agent_device(text, text, text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;

-- Allow reading signed manifests and versioned release artifacts in agent-updates
DROP POLICY IF EXISTS "agent_updates_read_signed_manifest" ON storage.objects;
CREATE POLICY "agent_updates_read_signed_manifest"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'agent-updates'
  AND (
    name IN ('manifest.stable.sig.json', 'manifest.beta.sig.json')
    OR name LIKE 'v%'
  )
);
