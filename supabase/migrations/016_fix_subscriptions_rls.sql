-- Fix subscriptions RLS: restrict INSERT/UPDATE to own user_id
-- Previous policies used WITH CHECK (true), allowing any authenticated user
-- to insert or modify any subscription record.

DROP POLICY IF EXISTS "Service can manage subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service can update subscriptions" ON subscriptions;

-- Users can insert their own subscription records
CREATE POLICY "Users can insert own subscription"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscription records
CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscription records
CREATE POLICY "Users can delete own subscription"
  ON subscriptions FOR DELETE
  USING (auth.uid() = user_id);
