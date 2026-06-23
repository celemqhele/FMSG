export type SearchEvent =
  | { type: "found_results"; count: number; progress: number }
  | { type: "screening_job"; current: number; total: number; progress: number }
  | { type: "analyzing_job"; title: string; company: string; current: number; total: number; progress: number }
  | { type: "almost_done"; progress: number }
  | { type: "pf_round"; round: number; max: number; query: string; progress: number }
  | { type: "complete"; results: unknown[]; progress: number; pf_mode?: boolean; pf_rounds?: number; message?: string }
  | { type: "error"; code: string; message: string; progress: number };

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
