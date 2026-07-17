import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractText } from "@/lib/pdf";
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
    const cvText = await extractText(buffer, filePath).catch(() => "");
    const text = cvText.trim();

    // Derive filename fallback from path (e.g. "Key_Account_Manager_CV.pdf" → "Key Account Manager")
    const rawName = filePath.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? "";
    const filenameLabel = rawName
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .trim();

    return NextResponse.json({ label: filenameLabel || "CV" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog(`[CV-LABEL] Fatal error: ${msg}`);
    return NextResponse.json({ label: "CV", error: msg });
  }
}
