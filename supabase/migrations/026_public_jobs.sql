CREATE TABLE public_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT '',
  estimated_salary TEXT DEFAULT '',
  snippet TEXT DEFAULT '',
  full_description TEXT NOT NULL DEFAULT '',
  paraphrased_description TEXT NOT NULL DEFAULT '',
  apply_url TEXT NOT NULL,
  source TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active jobs"
  ON public_jobs FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role can manage public_jobs"
  ON public_jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE UNIQUE INDEX idx_public_jobs_slug ON public_jobs (slug);
CREATE INDEX idx_public_jobs_active ON public_jobs (is_active) WHERE is_active = true;
