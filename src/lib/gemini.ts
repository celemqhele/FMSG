const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
// gpt-oss-120b rejects ~15k char prompts (HTTP 413). llama-3.1-70b-versatile
// has 128k context and generous free-tier limits — handles full scoring prompts.
const GROQ_MODEL = "llama-3.1-70b-versatile";

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

// ─── Gemini circuit breaker ──────────────────────────────────────────────────
// Once Gemini starts 429ing (free tier burns out mid-run), stop calling it and
// go straight to Groq/OpenRouter so remaining jobs finish instead of wasting
// time on doomed attempts.
export let geminiExhausted = false;
let gemini429Streak = 0;

function markGeminiFailure(errMsg: string): void {
  if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
    gemini429Streak++;
    if (gemini429Streak >= 2) {
      geminiExhausted = true;
      console.warn("[AI-GEMINI] Exhausted (2+ consecutive 429s) — bypassing Gemini for this request");
    }
  }
}

function markGeminiSuccess(): void {
  gemini429Streak = 0;
}

async function callGemini(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: config?.temperature ?? 0.1,
    maxOutputTokens: config?.maxOutputTokens ?? 4096,
  };
  if (config?.responseMimeType) {
    generationConfig.responseMimeType = config.responseMimeType;
  }

  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
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
    console.error(`[AI-GEMINI] FAIL HTTP ${res.status} (${elapsed}ms) input=${userText.length}chars — ${errBody.slice(0, 150)}`);
    throw new Error(`Gemini error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const output = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  console.log(`[AI-GEMINI] OK (${elapsed}ms) input=${userText.length}chars output=${output.length}chars`);
  return output;
}

interface GeminiSearchResult {
  text: string;
  groundingMetadata?: {
    searchEntryPoint?: { renderedContent: string };
    groundingChunks?: { web?: { uri: string; title: string } }[];
    groundingSupports?: { segment: { text: string }; support: { confidenceScore: number; groundingChunkIndices: number[] }[] }[];
  };
}

export async function callGeminiWithSearch(
  systemPrompt: string,
  userText: string,
  config?: AIConfig
): Promise<GeminiSearchResult> {
  await acquireAISlot();
  try {
    return await callGeminiWithSearchInner(systemPrompt, userText, config);
  } finally {
    releaseAISlot();
  }
}

async function callGeminiWithSearchInner(
  systemPrompt: string,
  userText: string,
  config?: AIConfig
): Promise<GeminiSearchResult> {
  const generationConfig: Record<string, unknown> = {
    temperature: config?.temperature ?? 0.1,
    maxOutputTokens: config?.maxOutputTokens ?? 4096,
  };
  if (config?.responseMimeType) {
    generationConfig.responseMimeType = config.responseMimeType;
  }

  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`,
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
        tools: [{ google_search: {} }],
      }),
    }
  );

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[AI-GEMINI-SEARCH] FAIL HTTP ${res.status} (${elapsed}ms) input=${userText.length}chars — ${errBody.slice(0, 150)}`);
    throw new Error(`Gemini Search error (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks?.length ?? 0;
  console.log(`[AI-GEMINI-SEARCH] OK (${elapsed}ms) input=${userText.length}chars output=${text.length}chars grounded_chunks=${chunks}`);
  return { text, groundingMetadata };
}

export async function callGroq(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const t0 = Date.now();
  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    max_tokens: Math.min(config?.maxOutputTokens ?? 4096, 16384),
      temperature: config?.temperature ?? 0.1,
    }),
  });

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[AI-GROQ] FAIL HTTP ${res.status} (${elapsed}ms) input=${userText.length}chars — ${errBody.slice(0, 150)}`);
    throw new Error(`Groq error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const output = data.choices?.[0]?.message?.content ?? "";
  console.log(`[AI-GROQ] OK (${elapsed}ms) input=${userText.length}chars output=${output.length}chars`);
  return output;
}

const OPENROUTER_FALLBACK_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-3.1-flash-lite",
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
  await acquireAISlot();
  try {
    return await callAIWithFallbackInner(systemPrompt, userText, stepName, config);
  } finally {
    releaseAISlot();
  }
}

async function callAIWithFallbackInner(
  systemPrompt: string,
  userText: string,
  stepName: string,
  config?: AIConfig
): Promise<string> {
  const t0 = Date.now();

  // Tier 1: Gemini (skipped once circuit breaker trips — quota burned out)
  if (!geminiExhausted) {
    try {
      const result = await callGemini(systemPrompt, userText, config);
      lastAITier = "gemini";
      markGeminiSuccess();
      console.log(`[AI-TIER] step="${stepName}" tier=gemini total=${Date.now() - t0}ms`);
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      markGeminiFailure(msg);
      console.warn(`[AI-TIER] step="${stepName}" gemini FAILED: ${msg.slice(0, 100)}`);
      const isRetryable = msg.includes("429") || msg.includes("quota") || msg.includes("401") || msg.includes("403") || /5\d{2}/.test(msg) || /UNAVAILABLE/i.test(msg);
      if (!isRetryable) throw err;
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
      console.log(`[AI-TIER] step="${stepName}" tier=groq total=${Date.now() - t0}ms`);
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.warn(`[AI-TIER] step="${stepName}" groq FAILED: ${msg.slice(0, 100)}`);
      const isRetryable = msg.includes("429") || msg.includes("quota") || msg.includes("401") || msg.includes("403") || msg.includes("413") || /5\d{2}/.test(msg) || /UNAVAILABLE/i.test(msg);
      if (!isRetryable) throw err;
    }
  }

  // Tier 3: OpenRouter
  try {
    const result = await callOpenRouter(systemPrompt, truncatedText, config);
    lastAITier = "openrouter";
    console.log(`[AI-TIER] step="${stepName}" tier=openrouter total=${Date.now() - t0}ms`);
    return result;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[AI-TIER] step="${stepName}" ALL TIERS FAILED after ${Date.now() - t0}ms: ${msg.slice(0, 150)}`);
    throw err;
  }
}
