import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import { extractTextFromDOCX } from "@/lib/docx";
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
  "preferred_location": string,
  "industry": string,
  "current_salary": number | null,
  "desired_salary": number | null
}

Rules — reason like a recruiter, not a parser:

job_titles: Generate a 5-step job title broadening ladder. CRITICAL: This ladder broadens LATERALLY through related specialties at the SAME seniority level — it never climbs the seniority hierarchy. Think of it like broadening through umbrellas: a niche role sits under a sub-umbrella that sits under an umbrella, and each step moves one umbrella outward while staying at the same level.

Rules:
- Step [0] = the candidate's exact current/most recent role, translated to industry-standard job board title.
- Steps [1]-[3] = LATERAL moves at the SAME seniority level. Broaden into adjacent specialties that share overlapping skills but sit in different sub-domains. Same level of seniority, different flavour of the work. The candidate's CV qualifications should match these roles.
- Step [4] = the broadest generic function-level description (e.g. "IT Professional", "Business Professional", "Engineering Professional").
- NEVER include titles that represent seniority escalation: Manager, Senior, Lead, Principal, Director, VP, Head of, Chief, CISO, CTO, or any C-suite — unless the candidate already holds that exact seniority. A Penetration Tester does NOT broaden into Security Manager or CSO. They broaden into Cyber Security Analyst, SOC Analyst, Vulnerability Assessor.
- Each step must be a genuine, searchable job board title. Avoid compound titles.
- The ladder should reflect what the candidate COULD do based on their actual experience — not a generic template.
- Return exactly 5 titles.

Examples:
["Penetration Tester", "Cyber Security Analyst", "SOC Analyst", "Vulnerability Assessor", "IT Professional"]
["Software Engineer", "Backend Developer", "Full Stack Developer", "Platform Engineer", "IT Developer"]
["Data Analyst", "Business Intelligence Analyst", "Reporting Analyst", "Operations Analyst", "Business Professional"]
["Graphic Designer", "UX Designer", "UI Designer", "Visual Designer", "Creative Professional"]

job_types: Infer what work arrangement the candidate likely wants going forward based on their recent trajectory. Consider whether their recent roles were Remote, Hybrid, or On-site. If the CV shows a consistent pattern (e.g. all recent roles were Remote), list only that type. If it varies or is unclear, list the most common one. Return an array of 1-3 values from: "Remote", "Hybrid", "On-site".

preferred_location: Infer the candidate's likely preferred location going forward based on their most recent role's location and any address info in the CV. Return a single geographic string (city and/or country) — never include descriptors like "Remote" or "Hybrid". If unclear, use "South Africa".

industry: Determine the single industry the candidate works in. CRITICAL: Industry is where the candidate's EMPLOYERS/COMPANIES operate, not what their job title or tools suggest. Read the company names in their work history and what those companies sell. "Customer Success Manager" at a datacenter company (Vertiv) = Critical Digital Infrastructure, NOT SaaS. "Digital marketer" at Superbalist = E-commerce, NOT SaaS. Look at the actual business of their employers. Return a concise label (e.g. "Fintech", "Healthcare", "E-commerce", "Construction", "Education", "Critical Digital Infrastructure", "Manufacturing"). Use empty string if truly unclear.

current_salary: Estimate this candidate's gross MONTHLY salary in ZAR for their most recent or current role. Base this on: their total years of experience (infer from work history dates), their seniority level and the job title of their most recent role, their location (major metros like Johannesburg and Cape Town command higher salaries than smaller cities), and your knowledge of typical South African salary bands for that industry and role. Round to the nearest 1000. Return null ONLY if the CV has zero work history or provides no basis to estimate (e.g. a fresh graduate with no internships — still estimate for grad-level roles, but return null if truly no data).

desired_salary: Estimate a realistic gross MONTHLY salary in ZAR that this candidate could target for their next role. This should typically be 10-25% above current_salary depending on their career trajectory, or at market rate for the next-step titles. Round to the nearest 1000. If current_salary is null, estimate directly from market rate for their experience level, titles, and location. Return null ONLY if no basis at all exists.

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

    const isPDF = file.type === "application/pdf";
    const isDOCX = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.endsWith(".docx");
    if (!isPDF && !isDOCX) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });
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
      text = isPDF ? await extractTextFromPDF(buffer) : await extractTextFromDOCX(buffer);
    } catch (parseErr) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("File extraction error:", parseMsg);
      return NextResponse.json({ error: `Failed to parse file: ${parseMsg.slice(0, 200)}`, code: "PARSE_ERROR" }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Could not extract any text from the file." }, { status: 400 });
    }

    // Upload raw PDF to Supabase Storage using user's auth UID for RLS compatibility
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from("cv-files")
      .upload(storagePath, buffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr.message);
      return NextResponse.json({ error: "Failed to store file.", code: "STORAGE_ERROR" }, { status: 500 });
    }

    const MAX_CV_CHARS = 20000;
    const truncatedText = text.length > MAX_CV_CHARS
      ? text.slice(0, MAX_CV_CHARS) + "\n\n[CV truncated — text exceeded token budget]"
      : text;

    let content: string | null = null;
    try {
      content = await callAIWithFallback(SYSTEM_PROMPT, truncatedText, "CV extraction", { responseMimeType: "application/json" });
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
      industry: parsed.industry ?? "",
      current_salary: typeof parsed.current_salary === "number" ? parsed.current_salary : null,
      desired_salary: typeof parsed.desired_salary === "number" ? parsed.desired_salary : null,
      cv_file_path: storagePath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Extract CV error:", msg);
    return NextResponse.json({ error: msg, code: "UNKNOWN" }, { status: 500 });
  }
}
