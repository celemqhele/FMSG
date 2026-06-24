import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SYSTEM_PROMPT = `You are a recruiter reviewing a CV. Extract structured information and return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "name": string,
  "surname": string,
  "phone": string,
  "address": string,
  "job_titles": string[],
  "job_types": string[],
  "preferred_location": string
}

Rules — reason like a recruiter, not a parser:

job_titles: Based on this candidate's most recent and most substantial work experience, identify 2-5 job titles they should realistically be searching for. Prioritise their current or most recent role and titles that reflect career progression — not entry-level or early-career titles from years ago unless their career stayed at that level. Include 1-2 adjacent or natural next-step titles. CRITICAL: Use generic, industry-standard titles that actual job listings use. Avoid long compound titles like "Senior Key Account and Administrative Manager" — use titles job boards actually have like "Key Account Manager" or "Office Manager". If the candidate has a very niche title, translate it into the closest standard equivalent.

job_types: Infer what work arrangement the candidate likely wants going forward based on their recent trajectory. Consider whether their recent roles were Remote, Hybrid, or On-site. If the CV shows a consistent pattern (e.g. all recent roles were Remote), list only that type. If it varies or is unclear, list the most common one. Return an array of 1-3 values from: "Remote", "Hybrid", "On-site".

preferred_location: Infer the candidate's likely preferred location going forward based on their most recent role's location and any address info in the CV. Return a single geographic string (city and/or country) — never include descriptors like "Remote" or "Hybrid". If unclear, use "South Africa".

Use empty arrays and empty strings for missing data. Never invent facts — reason from what the CV actually shows.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const rl = checkRateLimit(`extract:${user.id}`, "extract");
    if (!rl.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: `Too many CV extractions. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

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

    // Upload raw PDF to Supabase Storage using user's auth UID for RLS compatibility
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from("cv-files")
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr.message);
      return NextResponse.json({ error: "Failed to store file.", code: "STORAGE_ERROR" }, { status: 500 });
    }

    // Send to AI (Gemini → Groq fallback)
    let content: string | null = null;
    try {
      content = await callAIWithFallback(SYSTEM_PROMPT, text, "CV extraction", { responseMimeType: "application/json" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI error:", msg);
      if (msg.includes("503")) {
        return NextResponse.json({ error: "Service temporarily unavailable. Please try again in 30 minutes.", code: "AI_OVERLOADED" }, { status: 503 });
      }
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
