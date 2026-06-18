import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = `You are a CV parsing assistant. Extract structured information from the CV text below and return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "skills": string[],
  "experience": { "company": string, "role": string, "start_date": string, "end_date": string, "description": string }[],
  "education": { "institution": string, "degree": string, "year": number }[],
  "years_of_experience": number,
  "current_role": string,
  "location": string
}
Use empty arrays and empty strings for missing data. Never invent information.`;

async function callGemini(text: string): Promise<any> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${text}` }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
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

async function callGroq(text: string): Promise<any> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const pdf = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdf(buffer);
  return data.text;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Max 10MB." }, { status: 400 });
    }

    const allowedTypes = ["application/pdf", "text/plain"];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".txt")) {
      return NextResponse.json({ error: "Only PDF and TXT files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (file.type === "application/pdf") {
      try {
        text = await extractTextFromPDF(buffer);
      } catch (pdfErr) {
        const pdfMsg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        console.error("PDF extraction error:", pdfMsg);
        return NextResponse.json({ error: `Failed to parse PDF: ${pdfMsg.slice(0, 200)}`, code: "PDF_PARSE_ERROR" }, { status: 400 });
      }
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Could not extract any text from the file." }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key not configured." }, { status: 500 });
    }

    let content: string | null = null;
    let lastErr: string | null = null;

    try {
      content = await callGemini(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gemini error:", msg);
      lastErr = msg;

      if (GROQ_API_KEY) {
        try {
          content = await callGroq(text);
        } catch (groqErr) {
          const groqMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
          console.error("Groq error:", groqMsg);
          lastErr += ` | ${groqMsg}`;
        }
      }
    }

    if (!content) {
      return NextResponse.json({ error: `AI extraction failed. ${lastErr}`, code: "AI_ERROR" }, { status: 502 });
    }

    const cleaned = content.replace(/```(?:json)?\s*/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response as JSON. Raw:", content.slice(0, 500));
      return NextResponse.json({ error: "AI returned invalid JSON. Please try again.", code: "INVALID_JSON" }, { status: 502 });
    }

    return NextResponse.json({
      skills: parsed.skills ?? [],
      experience: parsed.experience ?? [],
      education: parsed.education ?? [],
      years_of_experience: parsed.years_of_experience ?? 0,
      current_role: parsed.current_role ?? "",
      location: parsed.location ?? "",
      cv_text: text.slice(0, 10000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Extract CV error:", msg);
    let code = "UNKNOWN";
    if (msg.includes("pdfjs") || msg.includes("PDF") || msg.includes("getDocument")) code = "PDF_PARSE_ERROR";
    else if (msg.includes("fetch") || msg.includes("network")) code = "NETWORK_ERROR";
    return NextResponse.json({ error: msg, code }, { status: 500 });
  }
}
