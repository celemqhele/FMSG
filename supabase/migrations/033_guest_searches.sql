-- Guest search limit enforcement.
-- The guest_searches table records one row per IP hash so the one-search-per-device
-- limit is enforced durably across serverless instances (the in-memory rate limit
-- resets on every Vercel cold start). A unique index on ip_hash makes the
-- "claim" atomic in /api/guest-search via upsert ... on conflict.
--
-- NOTE: DROP + recreate is intentional. On some environments this table was
-- created earlier with a different schema (missing ip_hash), which silently
-- disabled every DB-side limit check. It only holds rate-limit bookkeeping, so
-- recreating it with the correct schema is safe.

DROP TABLE IF EXISTS guest_searches;

CREATE TABLE guest_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  query text NOT NULL DEFAULT '',
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX guest_searches_ip_hash_key ON guest_searches (ip_hash);

ALTER TABLE guest_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages guest_searches" ON guest_searches;
CREATE POLICY "Service role manages guest_searches"
  ON guest_searches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
