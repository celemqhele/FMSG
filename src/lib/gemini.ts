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

export async function callGemini(systemPrompt: string, userText: string, config?: AIConfig): Promise<string> {
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

async function attemptWithRetry(
  provider: "gemini" | "groq",
  systemPrompt: string,
  userText: string,
  config?: AIConfig
): Promise<string> {
  const fn = provider === "gemini" ? callGemini : groqGenerate;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(systemPrompt, userText, config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusMatch = msg.match(/error \((\d+)\)/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      if (status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Retries exhausted");
}

export async function callAI(
  systemPrompt: string,
  userText: string,
  config?: AIConfig
): Promise<string> {
  try {
    return await attemptWithRetry("gemini", systemPrompt, userText, config);
  } catch (geminiErr) {
    if (GROQ_API_KEY) {
      try {
        return await attemptWithRetry("groq", systemPrompt, userText, config);
      } catch {
        throw geminiErr;
      }
    }
    throw geminiErr;
  }
}
