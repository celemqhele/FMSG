import { NextRequest, NextResponse } from "next/server";
import { extractTextFromPDF } from "@/lib/pdf";
import { callAIWithFallback } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    let text = "";
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (file.name.endsWith(".pdf")) {
      try {
        text = await extractTextFromPDF(buffer);
      } catch (err) {
        console.error("[CV_PARSE] PDF extraction failed:", err);
        return NextResponse.json({ error: "Could not read PDF. Try a different file." }, { status: 400 });
      }
    } else if (file.name.endsWith(".txt")) {
      text = buffer.toString("utf-8");
    } else if (file.name.endsWith(".docx")) {
      return NextResponse.json({ error: "DOCX files not yet supported. Please upload a PDF or TXT file." }, { status: 400 });
    } else {
      return NextResponse.json({ error: "Please upload a PDF or TXT file." }, { status: 400 });
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: "Could not extract enough text from the file. Is it a valid CV?" }, { status: 400 });
    }

    const prompt = `You are a CV parser. Extract the following from this CV and return ONLY a JSON object. No explanation.

{
  "job_titles": ["title1", "title2"],
  "location": "City, Province",
  "industry": "main industry",
  "desired_salary": number or null,
  "current_salary": number or null
}

CV TEXT:
${text.slice(0, 6000)}`;

    const raw = await callAIWithFallback(
      "You are a CV parsing assistant. Extract structured data from CV text. Return valid JSON only.",
      prompt,
      "cv-parse",
      { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 },
    );

    const parsed = JSON.parse(raw);

    return NextResponse.json({
      job_titles: Array.isArray(parsed.job_titles) ? parsed.job_titles.filter(Boolean).slice(0, 5) : [],
      location: typeof parsed.location === "string" ? parsed.location : "",
      industry: typeof parsed.industry === "string" ? parsed.industry : "",
      desired_salary: typeof parsed.desired_salary === "number" ? parsed.desired_salary : null,
      current_salary: typeof parsed.current_salary === "number" ? parsed.current_salary : null,
    });
  } catch (err) {
    console.error("[CV_PARSE] Error:", err);
    return NextResponse.json({ error: "Failed to parse CV. Please try again." }, { status: 500 });
  }
}
