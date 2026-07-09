import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const filePath = body?.file_path?.trim();
    if (!filePath) {
      return NextResponse.json({ error: "file_path is required." }, { status: 400 });
    }

    const { data: fileData } = await supabase.storage
      .from("cv-files")
      .download(filePath);

    if (!fileData) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const cvText = await extractTextFromPDF(buffer);

    if (!cvText.trim()) {
      return NextResponse.json({ label: "CV" });
    }

    const raw = await callAIWithFallback(
      `Read this CV and determine the primary job title or role the candidate
is targeting based on their most recent experience and skills. Return a
concise, descriptive label in this format: "[Role] CV".

Examples:
- "Key Account Manager CV"
- "Regional Sales Manager CV"
- "Software Engineer CV"
- "Senior IT Auditor CV"
- "Cybersecurity Analyst CV"

If the CV targets multiple distinct angles, pick the most prominent one.

Return ONLY valid JSON: { "label": "Key Account Manager CV" }`,
      cvText.slice(0, 8000),
      "suggest CV label",
      { responseMimeType: "application/json", temperature: 0.3 },
    );

    const cleaned = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const data = JSON.parse(cleaned);
    const label = (data.label ?? "CV").trim();

    return NextResponse.json({ label: label || "CV" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ label: "CV", error: msg });
  }
}
