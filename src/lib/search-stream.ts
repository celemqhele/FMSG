export type SearchEvent =
  | { type: "search_started"; search_id: string }
  | { type: "searching"; query: string; progress: number }
  | { type: "found_results"; count: number; progress: number }
  | { type: "screening_job"; current: number; total: number; progress: number }
  | { type: "analyzing_job"; title: string; company: string; current: number; total: number; progress: number }
  | { type: "almost_done"; progress: number }
  | { type: "pf_round"; round: number; max: number; query: string; progress: number }
  | { type: "job_scored"; search_id: string; job: JobResult; current: number; total: number; progress: number }
  | { type: "search_timeout"; search_id: string; results: JobResult[]; message: string; progress: number }
  | { type: "complete"; results: unknown[]; progress: number; pf_mode?: boolean; pf_rounds?: number; message?: string; filtered_summary?: FilteredSummary; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string; pf_tiers?: { hire: number; interview: number; reject: number }; pf_summary?: { totalFound: number; highCount: number; midCount: number; lowCount: number; roundsExecuted: number } }
  | { type: "error"; code: string; message: string; progress: number }
  | { type: "filtered_summary"; history: number; saved: number; rejected: number; blocked: number; progress: number }
  | { type: "pause"; message: string; progress: number; continuation: string; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string }
  | { type: "screening_pause"; message: string; progress: number; continuation: string; screening_offset?: number; screening_total?: number; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string }
  | { type: "partial_complete"; results: unknown[]; progress: number; continuation: string; message: string; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string };

export interface JobResult {
  id: string;
  user_id: string;
  search_id: string;
  profile_id: string | null;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  verdict_bullets: { industry: string; function: string; competition: string } | null;
  job_url: string;
  full_spec: string;
  search_query: string;
  posted_at: string;
  suggested_cv: string;
  knockout_fail: boolean | null;
  pillar_scores: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied: string[] | null;
  total_questions_asked: number | null;
  yes_answers: number | null;
  recruiter_verdict: string | null;
  dynamic_requirements: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  spec_source: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "bing_jobs" | "scrappa" | "ditto" | "workday" | null;
}

export interface FilteredSummary {
  history: number;
  saved: number;
  rejected: number;
  blocked: number;
}

export class StreamWriter {
  private controller: ReadableStreamDefaultController;
  private encoder = new TextEncoder();

  constructor(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  send(event: SearchEvent): void {
    try {
      this.controller.enqueue(this.encoder.encode(JSON.stringify(event) + "\n"));
    } catch {
      // stream closed
    }
  }

  close(): void {
    try {
      this.controller.close();
    } catch {
      // already closed
    }
  }
}
