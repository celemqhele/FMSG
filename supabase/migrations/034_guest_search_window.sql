-- Guest search window: 1 free search per window (default 30 days) per IP.
--
-- Instead of a permanent one-per-IP block (033), the single guest_searches row
-- now carries created_at and is refreshed only once the window has elapsed.
-- try_claim_guest_search performs the claim atomically: it inserts the row, or
-- updates created_at when the previous claim is older than p_window.
--
-- The RETURNING (xmax = 0) expression distinguishes an insert (xmax = 0, true)
-- from an updated existing row (xmax <> 0, false), so /api/guest-search can
-- tell "claimed" from "still inside the window".

CREATE OR REPLACE FUNCTION public.try_claim_guest_search(
  p_ip_hash text,
  p_query text,
  p_location text,
  p_window interval
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed boolean;
BEGIN
  INSERT INTO guest_searches (ip_hash, query, location, created_at)
  VALUES (p_ip_hash, p_query, p_location, now())
  ON CONFLICT (ip_hash) DO UPDATE
    SET created_at = now(),
        query = EXCLUDED.query,
        location = EXCLUDED.location
    WHERE guest_searches.created_at < now() - p_window
  RETURNING (xmax = 0) INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_guest_search(text, text, text, interval) FROM PUBLIC;
