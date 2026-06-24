-- Atomic balance operations to prevent race conditions
-- Usage: SELECT decrement_search_balance(user_id, 1);

CREATE OR REPLACE FUNCTION decrement_search_balance(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INT;
BEGIN
  UPDATE profiles
  SET search_balance = GREATEST(search_balance - p_amount, 0)
  WHERE id = p_user_id
    AND search_balance >= p_amount
  RETURNING search_balance INTO v_balance;

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_cv_balance(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INT;
BEGIN
  UPDATE profiles
  SET cv_generation_balance = GREATEST(cv_generation_balance - p_amount, 0)
  WHERE id = p_user_id
    AND cv_generation_balance >= p_amount
  RETURNING cv_generation_balance INTO v_balance;

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_pf_balance(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INT;
BEGIN
  UPDATE profiles
  SET persistent_finder_balance = GREATEST(persistent_finder_balance - p_amount, 0)
  WHERE id = p_user_id
    AND persistent_finder_balance >= p_amount
  RETURNING persistent_finder_balance INTO v_balance;

  RETURN v_balance;
END;
$$;
