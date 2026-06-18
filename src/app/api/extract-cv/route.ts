import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SYSTEM_PROMPT = `You are a CV parsing assistant. Extract structured information from the CV text below and return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "name": string,
  "surname": string,
  "phone": string,
  "address": string,
  "job_titles": string[],
  "job_types": string[],
  "preferred_location": string
}
Use empty arrays and empty strings for missing data. Never invent information.`;

async function callGemini(text: string): Promise<any> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text }] }],
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

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Max 10MB." }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key not configured." }, { status: 500 });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return NextResponse.json({ error: "Storage not configured." }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text from PDF (server-side only, never stored)
    let text: string;
    try {
      text = await extractTextFromPDF(buffer);
    } catch (pdfErr) {
      const pdfMsg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.error("PDF extraction error:", pdfMsg);
      return NextResponse.json({ error: `Failed to parse PDF: ${pdfMsg.slice(0, 200)}`, code: "PDF_PARSE_ERROR" }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Could not extract any text from the file." }, { status: 400 });
    }

    // Upload raw PDF to Supabase Storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const storagePath = `cv-files/${crypto.randomUUID()}/${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("cv-files")
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr.message);
      return NextResponse.json({ error: "Failed to store file.", code: "STORAGE_ERROR" }, { status: 500 });
    }

    // Send to Gemini
    let content: string | null = null;
    try {
      content = await callGemini(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gemini error:", msg);
      return NextResponse.json({ error: `AI extraction failed. ${msg}`, code: "AI_ERROR" }, { status: 502 });
    }

    if (!content) {
      return NextResponse.json({ error: "AI extraction failed. Empty response.", code: "AI_ERROR" }, { status: 502 });
    }

    const cleaned = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1).trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response as JSON. Raw:", content.slice(0, 500));
      return NextResponse.json({ error: "AI returned invalid JSON. Please try again.", code: "INVALID_JSON" }, { status: 502 });
    }

    return NextResponse.json({
      name: parsed.name ?? "",
      surname: parsed.surname ?? "",
      phone: parsed.phone ?? "",
      address: parsed.address ?? "",
      job_titles: parsed.job_titles ?? [],
      job_types: parsed.job_types ?? [],
      preferred_location: parsed.preferred_location ?? "",
      cv_file_path: storagePath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Extract CV error:", msg);
    return NextResponse.json({ error: msg, code: "UNKNOWN" }, { status: 500 });
  }
}
