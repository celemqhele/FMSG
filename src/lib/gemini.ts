const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export interface AIConfig {
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}

export let lastAITier: "gemini" | "groq" | "openrouter" = "gemini";

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

export async function callGroq(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
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

async function callOpenRouter(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://findmesomejobs.co.za",
      "X-Title": "Find Me Some Jobs",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-r1:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_tokens: config?.maxOutputTokens ?? 4096,
      temperature: config?.temperature ?? 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Three-tier AI cascade: Gemini → Groq → OpenRouter. Falls back on 429/quota. */
export async function callAIWithFallback(
  systemPrompt: string,
  userText: string,
  stepName: string,
  config?: AIConfig
): Promise<string> {
  // Tier 1: Gemini
  try {
    const result = await callGemini(systemPrompt, userText, config);
    lastAITier = "gemini";
    console.log("AI handled by: Gemini");
    return result;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.log(`[AI] Gemini error on "${stepName}": ${msg}`);
    if (!msg.includes("429") && !msg.includes("quota")) throw err;
  }

  // Tier 2: Groq
  if (GROQ_API_KEY) {
    try {
      const result = await callGroq(systemPrompt, userText, config);
      lastAITier = "groq";
      console.log("AI handled by: Groq");
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.log(`[AI] Groq error on "${stepName}": ${msg}`);
      if (!msg.includes("429") && !msg.includes("quota")) throw err;
    }
  }

  // Tier 3: OpenRouter
  try {
    const result = await callOpenRouter(systemPrompt, userText, config);
    lastAITier = "openrouter";
    console.log("AI handled by: OpenRouter");
    return result;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.log(`[AI] OpenRouter error on "${stepName}": ${msg}`);
    throw err;
  }
}
