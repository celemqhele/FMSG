const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export interface AIConfig {
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: config?.temperature ?? 0.1,
    maxOutputTokens: config?.maxOutputTokens ?? 4096,
  };
  if (config?.responseMimeType) {
    generationConfig.responseMimeType = config.responseMimeType;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig,
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function groqGenerate(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
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
      max_tokens: config?.maxOutputTokens ?? 4096,
      temperature: config?.temperature ?? 0.1,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

/** Shared AI call with Gemini → Groq fallback.
 *  Retries on 429/500/502/503, falls back to Groq on persistent failure.
 *  stepName is logged so we can identify which step is hitting quota hardest. */
export async function callAIWithFallback(
  systemPrompt: string,
  userText: string,
  stepName: string,
  config?: AIConfig
): Promise<string> {
  // Try Gemini with retries
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await callGemini(systemPrompt, userText, config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusMatch = msg.match(/error \((\d+)\)/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      if (attempt < 2 && RETRYABLE_STATUSES.has(status)) {
        const delay = (Math.pow(2, attempt) + Math.random()) * 1000;
        console.log(`[AI] Gemini ${status} on "${stepName}", retry ${attempt + 1} in ${Math.round(delay)}ms`);
        await sleep(delay);
        continue;
      }

      console.log(`[AI] Gemini error on "${stepName}": ${msg}`);
      break;
    }
  }

  // Fall back to Groq
  if (GROQ_API_KEY) {
    console.log(`[AI] Falling back to Groq for: ${stepName}`);
    try {
      return await groqGenerate(systemPrompt, userText, config);
    } catch (groqErr) {
      const groqMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      console.log(`[AI] Groq also failed on "${stepName}": ${groqMsg}`);
    }
  }

  throw new Error(`Gemini error: All attempts failed for "${stepName}"`);
}

// Export for direct calls where fallback is handled externally (e.g. search Pass 2 per-job calls)
export { callGemini };
