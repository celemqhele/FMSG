-- Performance indexes for common queries

CREATE INDEX IF NOT EXISTS idx_job_results_user_id ON job_results (user_id);
CREATE INDEX IF NOT EXISTS idx_job_results_user_created ON job_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_results_search_id ON job_results (search_id);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON saved_jobs (user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paystack_sub ON subscriptions (paystack_subscription_id);

CREATE INDEX IF NOT EXISTS idx_search_profiles_user_id ON search_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_rejected_jobs_user_id ON rejected_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_rejected_jobs_search_id ON rejected_jobs (search_id);

CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs (user_id);
