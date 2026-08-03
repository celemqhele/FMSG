-- Guest search limit enforcement.
-- The guest_searches table records one row per IP hash so the one-search-per-device
-- limit is enforced durably across serverless instances (the in-memory rate limit
-- resets on every Vercel cold start). A unique index on ip_hash makes the
-- "claim" atomic in /api/guest-search via insert ... on conflict.

CREATE TABLE IF NOT EXISTS guest_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  query text NOT NULL DEFAULT '',
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe any pre-existing duplicate ip_hash rows before adding the unique index
-- (keeps a single, deterministic row per ip_hash).
DELETE FROM guest_searches
WHERE ctid NOT IN (
  SELECT min(ctid) FROM guest_searches GROUP BY ip_hash
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_searches_ip_hash_key ON guest_searches (ip_hash);

ALTER TABLE guest_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages guest_searches" ON guest_searches;
CREATE POLICY "Service role manages guest_searches"
  ON guest_searches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
