import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * FMSG Agents — desktop agent language-model bridge.
 *
 * The desktop app never holds a model provider key. It sends the running
 * conversation here with the user's Supabase access token; this route
 * authenticates the caller, then forwards the turn to OpenRouter using the
 * server-only key. Requests are shaped like a first-party, tool-using agent
 * (referer/title headers + explicit tool schemas) so the free tier treats them
 * as legitimate application traffic.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SITE = "https://findmesomejobs.co.za";
const OPENROUTER_TITLE = "FMSG Agents";

// Primary brain: Inkling (largest variant) on the free tier, then the smaller
// Inkling, then two widely-available fallbacks so a provider-side retirement or
// free-tier throttle degrades instead of killing the run.
const AGENT_MODELS = [
  process.env.AGENT_MODEL_PRIMARY || "thinkingmachines/inkling:free",
  process.env.AGENT_MODEL_SECONDARY || "thinkingmachines/inkling-small:free",
  process.env.AGENT_MODEL_FALLBACK_1 || "google/gemini-3.5-flash-lite",
  process.env.AGENT_MODEL_FALLBACK_2 || "openai/gpt-4o-mini",
];

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

interface AgentAIRequest {
  messages: ChatMessage[];
  tools?: unknown[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 40_000;
const MAX_TOTAL_CHARS = 160_000;

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  // Keep the system prompt plus the most recent turns. Old tool output is the
  // usual bloat source, and the running summary lives in the system prompt.
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const kept = rest.slice(-(MAX_MESSAGES - system.length));

  return [...system, ...kept].map((m) => ({
    ...m,
    content:
      typeof m.content === "string" && m.content.length > MAX_MESSAGE_CHARS
        ? `${m.content.slice(0, MAX_MESSAGE_CHARS)}\n\n[truncated]`
        : m.content,
  }));
}

function totalChars(messages: ChatMessage[]): number {
  return messages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
    0
  );
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": OPENROUTER_SITE,
      "X-Title": OPENROUTER_TITLE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model }),
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Agent service is not configured." },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader);

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rl = checkRateLimit(`agent-ai:${user.id}`, "agent-ai");
  if (!rl.allowed) {
    return NextResponse.json(
      {
        code: "RATE_LIMITED",
        error: "The agent is thinking too fast. Please try again in a moment.",
      },
      { status: 429, headers: { "Retry-After": "10" } }
    );
  }

  let payload: AgentAIRequest;
  try {
    payload = (await request.json()) as AgentAIRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (rawMessages.length === 0) {
    return NextResponse.json({ error: "No messages supplied." }, { status: 400 });
  }

  const messages = trimMessages(rawMessages);
  if (totalChars(messages) > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: "Conversation is too large for one turn." },
      { status: 413 }
    );
  }

  const keys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_KEY_2,
  ].filter((k): k is string => Boolean(k));

  if (keys.length === 0) {
    return NextResponse.json(
      { error: "The agent model is unavailable right now." },
      { status: 503 }
    );
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: Math.min(Math.max(payload?.temperature ?? 0.2, 0), 1),
    max_tokens: Math.min(Math.max(payload?.max_tokens ?? 1400, 64), 4096),
    // Ask OpenRouter to keep reasoning out of the assistant content so tool
    // calls and JSON stay parseable.
    reasoning: { effort: "low", exclude: true },
  };

  if (Array.isArray(payload?.tools) && payload.tools.length > 0) {
    body.tools = payload.tools;
    body.tool_choice = payload?.tool_choice ?? "auto";
  }
  if (payload?.response_format) {
    body.response_format = payload.response_format;
  }

  let lastStatus = 502;
  let lastDetail = "";

  for (const apiKey of keys) {
    for (const model of AGENT_MODELS) {
      try {
        const res = await callOpenRouter(apiKey, model, body);

        if (res.ok) {
          const data = await res.json();
          const message = data?.choices?.[0]?.message ?? null;
          if (!message) {
            lastDetail = "Empty model response";
            continue;
          }
          return NextResponse.json({
            ok: true,
            model,
            message,
            usage: data?.usage ?? null,
          });
        }

        lastStatus = res.status;
        const errText = await res.text();
        lastDetail = errText.slice(0, 300);
        console.warn(
          `[AGENT-AI] model=${model} HTTP ${res.status} — ${lastDetail.slice(0, 160)}`
        );

        // 400/404/422 mean this model id will never work; move on immediately.
        // 429/5xx are transient — a short pause then the next model.
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 900));
        }
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : String(err);
        console.warn(`[AGENT-AI] model=${model} threw: ${lastDetail.slice(0, 160)}`);
      }
    }
  }

  return NextResponse.json(
    {
      code: "MODEL_UNAVAILABLE",
      error: "The agent model is briefly unavailable. The agent will continue on its built-in rules.",
      detail: lastDetail.slice(0, 200),
    },
    { status: lastStatus === 429 ? 429 : 502 }
  );
}
