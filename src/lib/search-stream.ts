export type SearchEvent =
  | { type: "search_started"; search_id: string }
  | { type: "found_results"; count: number; progress: number }
  | { type: "screening_job"; current: number; total: number; progress: number }
  | { type: "analyzing_job"; title: string; company: string; current: number; total: number; progress: number }
  | { type: "almost_done"; progress: number }
  | { type: "pf_round"; round: number; max: number; query: string; progress: number }
  | { type: "complete"; results: unknown[]; progress: number; pf_mode?: boolean; pf_rounds?: number; message?: string; filtered_summary?: FilteredSummary; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string; pf_tiers?: { hire: number; interview: number; reject: number }; pf_summary?: { totalFound: number; highCount: number; midCount: number; lowCount: number; roundsExecuted: number } }
  | { type: "error"; code: string; message: string; progress: number }
  | { type: "filtered_summary"; history: number; saved: number; rejected: number; blocked: number; progress: number }
  | { type: "pause"; message: string; progress: number; continuation: string; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string }
  | { type: "partial_complete"; results: unknown[]; progress: number; continuation: string; message: string; balances?: { search: number; cv: number; pf: number; has_searched: boolean }; plan?: string };

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
