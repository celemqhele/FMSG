-- Fix profile balance defaults: Free tier should be 1 search, 0 CV gens, 0 PF
-- Previously defaults were 10 searches and 5 CV gens (accidentally matching Seeker tier)

ALTER TABLE profiles
  ALTER COLUMN search_balance SET DEFAULT 1,
  ALTER COLUMN cv_generation_balance SET DEFAULT 0,
  ALTER COLUMN persistent_finder_balance SET DEFAULT 0;
