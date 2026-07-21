/**
 * Per-API sliding-window rate limiter.
 * In-memory (best-effort on Vercel serverless — resets on cold start).
 * Sufficient for burst protection and quota tracking.
 */

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

// Clean up expired windows every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}, 60_000);

// ─── Per-API monthly/hourly limits (free tier caps) ────────────────────────
const API_LIMITS: Record<string, { windowMs: number; max: number; label: string }> = {
  // SerpAPI: 100 searches/month (free). Reserve 10 for safety.
  serpapi:   { windowMs: 30 * 24 * 60 * 60 * 1000, max: 90,  label: "SerpAPI (90/100 monthly)" },
  // JSearch: 200 requests/month (free BASIC). Reserve 20.
  jsearch:   { windowMs: 30 * 24 * 60 * 60 * 1000, max: 180, label: "JSearch (180/200 monthly)" },
  // Adzuna: ~250 calls/month (free). Reserve 20.
  adzuna:    { windowMs: 30 * 24 * 60 * 60 * 1000, max: 230, label: "Adzuna (230/250 monthly)" },
  // LinkedIn: no hard limit, but aggressive scraping = IP bans. Conservative hourly cap.
  linkedin:  { windowMs: 60 * 60 * 1000,           max: 20,  label: "LinkedIn (20/hour)" },
  // Jina: rate-limited free tier. Conservative hourly cap.
  jina:      { windowMs: 60 * 60 * 1000,           max: 40,  label: "Jina (40/hour)" },
};

/**
 * Check if an API call is allowed under the rate limit.
 * Does NOT record the call — call `recordApiCall()` after a successful fetch.
 */
export function checkApiLimit(apiName: string): { allowed: boolean; remaining: number; total: number; retryAfterMs: number; label: string } {
  const cfg = API_LIMITS[apiName];
  if (!cfg) {
    // Unknown API — allow (don't block)
    return { allowed: true, remaining: 999, total: 999, retryAfterMs: 0, label: apiName };
  }

  const now = Date.now();
  const existing = windows.get(apiName);

  if (!existing || existing.resetAt <= now) {
    // New window — first call is always allowed
    windows.set(apiName, { count: 1, resetAt: now + cfg.windowMs });
    return {
      allowed: true,
      remaining: cfg.max - 1,
      total: cfg.max,
      retryAfterMs: 0,
      label: cfg.label,
    };
  }

  const remaining = Math.max(0, cfg.max - existing.count);
  const allowed = existing.count < cfg.max;
  const retryAfterMs = allowed ? 0 : existing.resetAt - now;

  return { allowed, remaining, total: cfg.max, retryAfterMs, label: cfg.label };
}

/**
 * Record a successful API call (increments the counter).
 */
export function recordApiCall(apiName: string): void {
  const cfg = API_LIMITS[apiName];
  if (!cfg) return;

  const now = Date.now();
  const existing = windows.get(apiName);

  if (!existing || existing.resetAt <= now) {
    windows.set(apiName, { count: 1, resetAt: now + cfg.windowMs });
  } else {
    existing.count++;
  }
}
