const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Tier 1 model. Gemini 3.x retired llama-era sampling params: custom
// temperature/topP/topK are silently ignored, so the payload below sends none
// and uses thinkingLevel as the only behavioural knob.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// Groq's free/dev tier only serves the GPT-OSS family now — llama-3.1/3.3,
// qwen3-32b/3.6-27b, kimi-k2 and llama-4 are all decommissioned or
// Enterprise-only. Tried in order, first model that answers wins, so a future
// retirement of the primary degrades instead of killing the whole tier.
const GROQ_MODELS = (process.env.GROQ_MODEL ?? "openai/gpt-oss-120b,openai/gpt-oss-20b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

interface AIConfig {
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}

export let lastAITier: "gemini" | "groq" | "openrouter" = "gemini";

// ─── Global AI concurrency semaphore ─────────────────────────────────────────
// Caps in-flight AI calls to AI_MAX_CONCURRENCY. On Vercel each request runs on
// its own instance, so this only throttles calls *within* one request. We keep a
// modest cap so 16-way batches flow in ~2 waves instead of hammering free-tier
// quotas with a full 16-way burst. If quota still trips, jobs fail fast to
// unscored cards rather than stalling the search.
const AI_MAX_CONCURRENCY = 8;
let activeAICalls = 0;
const aiWaiters: (() => void)[] = [];

async function acquireAISlot(): Promise<void> {
  if (activeAICalls < AI_MAX_CONCURRENCY) {
    activeAICalls++;
    return;
  }
  await new Promise<void>((resolve) => aiWaiters.push(resolve));
  activeAICalls++;
}

function releaseAISlot(): void {
  activeAICalls--;
  const next = aiWaiters.shift();
  if (next) next();
}

/** Live saturation gauge: how many slots are busy and how many callers are queued. */
function aiLoad(): string {
  return `inFlight=${activeAICalls}/${AI_MAX_CONCURRENCY} queued=${aiWaiters.length}`;
}

// ─── Per-request AI stats (for the [AI-STATS] summary line) ──────────────────
// On Vercel each invocation is a fresh module instance, so these counters are
// per-search — a clean tally of how much the Gemini free tier actually held up.
export const aiStats = {
  geminiCalls: 0,
  geminiOk: 0,
  geminiRateLimited: 0,   // HTTP 429 / RESOURCE_EXHAUSTED
  geminiOtherFail: 0,     // non-quota errors (404/5xx/etc.)
  fellToGroq: 0,          // Gemini unusable → Groq served the call
  fellToOpenRouter: 0,    // Gemini+Groq unusable → OpenRouter served the call
  totalQueueWaitMs: 0,    // time callers spent blocked on the 8-slot semaphore
  maxQueueWaitMs: 0,
  lastRetryAfterSec: null as number | null,
};

export function aiStatsSnapshot(): Record<string, number | null> {
  return { ...aiStats };
}

/** Pull rate-limit detail out of a Gemini 429: retry-after header + quota body. */
function parseGeminiRateLimit(res: Response, body: string): { retryAfterSec: number | null; quota: string } {
  let retryAfterSec: number | null = null;
  const ra = res.headers.get("retry-after");
  if (ra) {
    const n = parseInt(ra, 10);
    if (!Number.isNaN(n)) retryAfterSec = n;
  }
  let quota = "";
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.status) quota = String(parsed.error.status);
    for (const d of parsed?.error?.details ?? []) {
      if (d?.quotaId) quota = String(d.quotaId);
      else if (d?.metricName) quota = String(d.metricName);
      if (d?.retryDelay && retryAfterSec === null) {
        const secs = parseFloat(String(d.retryDelay).replace(/s$/, ""));
        if (!Number.isNaN(secs)) retryAfterSec = Math.ceil(secs);
      }
    }
  } catch { /* body isn't JSON — header-only detail */ }
  return { retryAfterSec, quota };
}

// ─── Gemini circuit breaker ──────────────────────────────────────────────────
// Once Gemini starts 429ing (free tier burns out mid-run), stop calling it and
// go straight to Groq/OpenRouter so remaining jobs finish instead of wasting
// time on doomed attempts.
export let geminiExhausted = false;
let gemini429Streak = 0;

function markGeminiFailure(errMsg: string): void {
  if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
    gemini429Streak++;
    console.warn(`[AI-GEMINI] rate-limit streak=${gemini429Streak} (opens circuit at 2) [${aiLoad()}]`);
    if (gemini429Streak >= 2) {
      geminiExhausted = true;
      console.warn(`[AI-GEMINI] CIRCUIT OPEN — 2+ consecutive 429s, bypassing Gemini for the rest of this request [${aiLoad()}]`);
    }
  }
}

function markGeminiSuccess(): void {
  gemini429Streak = 0;
}

async function callGemini(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: config?.maxOutputTokens ?? 4096,
    // Google recommends "minimal" for high-throughput classification and JSON
    // extraction. Pinned explicitly so a model-side default change can't alter
    // our output shape.
    thinkingConfig: { thinkingLevel: "minimal" },
  };
  if (config?.responseMimeType) {
    generationConfig.responseMimeType = config.responseMimeType;
  }

  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig,
      }),
    }
  );

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const errBody = await res.text();
    const isRateLimit = res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(errBody);
    if (isRateLimit) {
      const { retryAfterSec, quota } = parseGeminiRateLimit(res, errBody);
      aiStats.geminiRateLimited++;
      aiStats.lastRetryAfterSec = retryAfterSec;
      console.warn(`[AI-GEMINI] RATE-LIMITED HTTP ${res.status} model=${GEMINI_MODEL} (${elapsed}ms) retryAfter=${retryAfterSec ?? "?"}s quota="${quota || "?"}" [${aiLoad()}] input=${userText.length}chars — ${errBody.slice(0, 120)}`);
    } else {
      aiStats.geminiOtherFail++;
      console.error(`[AI-GEMINI] FAIL HTTP ${res.status} model=${GEMINI_MODEL} (${elapsed}ms) [${aiLoad()}] input=${userText.length}chars — ${errBody.slice(0, 150)}`);
    }
    throw new Error(`Gemini error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const output = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  aiStats.geminiOk++;
  console.log(`[AI-GEMINI] OK model=${GEMINI_MODEL} (${elapsed}ms) [${aiLoad()}] input=${userText.length}chars output=${output.length}chars`);
  return output;
}

async function callGroqSingle(model: string, systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const t0 = Date.now();
  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_completion_tokens: Math.min(config?.maxOutputTokens ?? 4096, 16384),
      // Groq: gpt-oss is tuned for 0.5-0.7 and degrades below that, so a caller
      // asking for 0.1 gets floored rather than honoured literally.
      temperature: Math.max(config?.temperature ?? 0.1, 0.5),
      // Reasoning arrives in message.reasoning; content stays clean JSON.
      include_reasoning: false,
    }),
  });

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[AI-GROQ] FAIL HTTP ${res.status} model=${model} (${elapsed}ms) input=${userText.length}chars — ${errBody.slice(0, 150)}`);
    throw new Error(`Groq error (${res.status}) on ${model}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const output = data.choices?.[0]?.message?.content ?? "";
  console.log(`[AI-GROQ] OK model=${model} (${elapsed}ms) input=${userText.length}chars output=${output.length}chars`);
  return output;
}

export async function callGroq(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  let lastErr: Error | null = null;
  for (const model of GROQ_MODELS) {
    try {
      return await callGroqSingle(model, systemPrompt, userText, config);
    } catch (err: any) {
      lastErr = err;
      console.warn(`[AI-GROQ] model=${model} failed: ${(err?.message ?? String(err)).slice(0, 100)}`);
    }
  }
  throw lastErr ?? new Error("Groq: no models configured (GROQ_MODEL empty?)");
}

const OPENROUTER_FALLBACK_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-3.5-flash-lite",
  "deepseek/deepseek-chat",
];

async function callOpenRouterSingle(model: string, systemPrompt: string, userText: string, apiKey: string, config?: AIConfig): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    max_tokens: config?.maxOutputTokens ?? 4096,
    temperature: config?.temperature ?? 0.1,
  };
  // response_format: { type: "json_object" } forces ALL output into an object {},
  // which breaks prompts that expect arrays. Omit it here — the system prompt
  // already instructs the model to return valid JSON.

  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://findmesomejobs.co.za",
      "X-Title": "Find Me Some Jobs",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[AI-OPENROUTER] FAIL HTTP ${res.status} model=${model} (${elapsed}ms) input=${userText.length}chars — ${errBody.slice(0, 150)}`);
    throw new Error(`OpenRouter error (${res.status}) on ${model}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const output = data.choices?.[0]?.message?.content ?? "";
  console.log(`[AI-OPENROUTER] OK model=${model} (${elapsed}ms) input=${userText.length}chars output=${output.length}chars`);
  return output;
}

async function callOpenRouter(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const keys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_KEY_2,
  ].filter((k): k is string => !!k);

  const lastErr: Error[] = [];
  for (const apiKey of keys) {
    for (const model of OPENROUTER_FALLBACK_MODELS) {
      try {
        const result = await callOpenRouterSingle(model, systemPrompt, userText, apiKey, config);
        return result;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        lastErr.push(err);
      }
    }
    console.warn(`[AI-OPENROUTER] All models failed for this key — trying next key`);
  }
  throw new Error(`OpenRouter — all ${OPENROUTER_FALLBACK_MODELS.length} models failed with all keys. Last error: ${(lastErr.at(-1)?.message ?? "").slice(0, 200)}`);
}

/** Three-tier AI cascade: Gemini → Groq → OpenRouter. Falls back on 429/quota. */
export async function callAIWithFallback(
  systemPrompt: string,
  userText: string,
  stepName: string,
  config?: AIConfig
): Promise<string> {
  aiStats.geminiCalls++;
  // Measure how long this call is BLOCKED on the 8-slot semaphore. This is the
  // hidden latency: a call that queues 20s then answers in 500ms used to log
  // total=500ms, making a saturated Gemini tier look "instant".
  const q0 = Date.now();
  await acquireAISlot();
  const queueWaitMs = Date.now() - q0;
  aiStats.totalQueueWaitMs += queueWaitMs;
  if (queueWaitMs > aiStats.maxQueueWaitMs) aiStats.maxQueueWaitMs = queueWaitMs;
  if (queueWaitMs >= 500) {
    console.warn(`[AI-SLOT] step="${stepName}" waited ${queueWaitMs}ms for a slot [${aiLoad()}]`);
  }
  try {
    return await callAIWithFallbackInner(systemPrompt, userText, stepName, config, queueWaitMs);
  } finally {
    releaseAISlot();
  }
}

async function callAIWithFallbackInner(
  systemPrompt: string,
  userText: string,
  stepName: string,
  config: AIConfig | undefined,
  queueWaitMs: number
): Promise<string> {
  const t0 = Date.now();
  const total = () => queueWaitMs + (Date.now() - t0); // includes the queue wait we just burned

  // Tier 1: Gemini (skipped once circuit breaker trips — quota burned out)
  if (!geminiExhausted) {
    try {
      const result = await callGemini(systemPrompt, userText, config);
      lastAITier = "gemini";
      markGeminiSuccess();
      console.log(`[AI-TIER] step="${stepName}" tier=gemini total=${total()}ms (queued ${queueWaitMs}ms)`);
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      markGeminiFailure(msg);
      console.warn(`[AI-TIER] step="${stepName}" gemini FAILED: ${msg.slice(0, 100)}`);
      // 404 = model id retired/renamed upstream — same operational class as a
      // 429, so fall through rather than failing the caller's request.
      const isRetryable = msg.includes("429") || msg.includes("quota") || msg.includes("401") || msg.includes("403") || msg.includes("404") || /5\d{2}/.test(msg) || /UNAVAILABLE/i.test(msg);
      if (!isRetryable) throw err;
      console.warn(`[AI-TIER] step="${stepName}" gemini→groq fallback after ${total()}ms (queue ${queueWaitMs}ms)`);
    }
  } else {
    console.log(`[AI-TIER] step="${stepName}" skipping gemini (exhausted)`);
  }

  const MAX_INPUT_CHARS = 15000;
  const truncatedText = userText.length > MAX_INPUT_CHARS
    ? userText.slice(0, MAX_INPUT_CHARS) + "\n\n[truncated]"
    : userText;

  // Tier 2: Groq
  if (GROQ_API_KEY) {
    try {
      const result = await callGroq(systemPrompt, truncatedText, config);
      lastAITier = "groq";
      aiStats.fellToGroq++;
      console.log(`[AI-TIER] step="${stepName}" tier=groq total=${total()}ms (queued ${queueWaitMs}ms)`);
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.warn(`[AI-TIER] step="${stepName}" groq FAILED: ${msg.slice(0, 100)}`);
      // 400/404/422 = a decommissioned or unrecognised model id (Groq retires
      // models aggressively). Those are provider-side config failures, not bad
      // prompts, so degrade to OpenRouter instead of failing the request.
      const isRetryable = msg.includes("429") || msg.includes("quota") || msg.includes("400") || msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("413") || msg.includes("422") || /5\d{2}/.test(msg) || /UNAVAILABLE/i.test(msg);
      if (!isRetryable) throw err;
      console.warn(`[AI-TIER] step="${stepName}" groq→openrouter fallback after ${total()}ms`);
    }
  }

  // Tier 3: OpenRouter
  try {
    const result = await callOpenRouter(systemPrompt, truncatedText, config);
    lastAITier = "openrouter";
    aiStats.fellToOpenRouter++;
    console.log(`[AI-TIER] step="${stepName}" tier=openrouter total=${total()}ms (queued ${queueWaitMs}ms)`);
    return result;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[AI-TIER] step="${stepName}" ALL TIERS FAILED after ${total()}ms: ${msg.slice(0, 150)}`);
    throw err;
  }
}
