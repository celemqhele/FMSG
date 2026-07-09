import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import { debugLog } from "@/lib/debug";

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
    const cvText = await extractTextFromPDF(buffer).catch(() => "");
    const text = cvText.trim();

    // Derive filename fallback from path (e.g. "Key_Account_Manager_CV.pdf" → "Key Account Manager")
    const rawName = filePath.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? "";
    const filenameLabel = rawName
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .trim();

    if (!text || text.length < 50) {
      debugLog(`[CV-LABEL] Text extraction returned ${text.length} chars, using filename fallback`);
      return NextResponse.json({ label: filenameLabel || "CV" });
    }

    let label = "CV";

    try {
      const raw = await callAIWithFallback(
        `You are reading a candidate's CV. Based on their most recent job title
and primary experience, generate a short, descriptive label for this CV.

Rules:
- Format: "[Role] CV"
- Use the candidate's most recent or strongest role — not their first job.
- Pick ONE clear role. Do not combine multiple roles.
- Do NOT return just "CV" — always include the role.

Examples:
"Key Account Manager CV"
"Regional Sales Manager CV"
"Software Engineer CV"
"Senior IT Auditor CV"
"DevOps Engineer CV"
"Financial Analyst CV"
"Marketing Manager CV"

Return ONLY valid JSON with no markdown:
{ "label": "Key Account Manager CV" }`,
        text.slice(0, 10000),
        "suggest CV label",
        { responseMimeType: "application/json", temperature: 0.3 },
      );

      try {
        const cleaned = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
        const data = JSON.parse(cleaned);
        const parsed = (data.label ?? "").trim();
        if (parsed && parsed.toLowerCase() !== "cv") {
          label = parsed;
        }
      } catch (parseErr) {
        debugLog(`[CV-LABEL] JSON parse failed, using filename fallback`);
      }
    } catch (aiErr) {
      debugLog(`[CV-LABEL] AI call failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`);
    }

    const final = label !== "CV" ? label : filenameLabel;
    debugLog(`[CV-LABEL] Final label: "${final}"`);
    return NextResponse.json({ label: final || "CV" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog(`[CV-LABEL] Fatal error: ${msg}`);
    return NextResponse.json({ label: "CV", error: msg });
  }
}
