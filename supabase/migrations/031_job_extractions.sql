-- Create job_extractions table for intermediate results
CREATE TABLE IF NOT EXISTS job_extractions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL CHECK (status IN ('processing', 'waiting_for_continue', 'completed', 'failed')),
    results JSONB DEFAULT '[]'::jsonb,
    current_round INTEGER DEFAULT 1,
    total_rounds INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Data API access (new tables need explicit grants since Supabase Oct 30 2026 change)
GRANT ALL ON TABLE public.job_extractions TO anon, authenticated, service_role;

-- Enable RLS
ALTER TABLE job_extractions ENABLE ROW LEVEL SECURITY;

-- Add RLS policy
CREATE POLICY "Users can view their own job extractions" ON job_extractions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own job extractions" ON job_extractions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job extractions" ON job_extractions
    FOR UPDATE USING (auth.uid() = user_id);
