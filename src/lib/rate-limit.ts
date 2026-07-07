type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}, 60_000);

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  search:       { windowMs: 60_000, max: 5 },
  extract:      { windowMs: 60_000, max: 3 },
  generate:     { windowMs: 60_000, max: 3 },
  webhook:      { windowMs: 60_000, max: 20 },
  general:      { windowMs: 60_000, max: 10 },
  signup:       { windowMs: 3_600_000, max: 5 },
  "send-verify": { windowMs: 3_600_000, max: 3 },
  verify:       { windowMs: 300_000, max: 10 },
  appeal:       { windowMs: 3_600_000, max: 2 },
  guest_search: { windowMs: 86_400_000, max: 1 },
};

export type RateLimitScope = string;

export function checkRateLimit(
  key: string,
  scope: RateLimitScope = "general"
): { allowed: boolean; remaining: number; resetAt: number } {
  const cfg = DEFAULTS[scope] ?? DEFAULTS.general;
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return { allowed: true, remaining: cfg.max - 1, resetAt: now + cfg.windowMs };
  }

  existing.count++;
  const remaining = Math.max(0, cfg.max - existing.count);
  return { allowed: existing.count <= cfg.max, remaining, resetAt: existing.resetAt };
}
