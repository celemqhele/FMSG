import { NextRequest, NextResponse } from "next/server";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const MODEL = "qwen-3-32b";

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await (pdfjs as any).getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item: any) => item.str)
      .map((item: any) => item.str)
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
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
      text = await extractTextFromPDF(buffer);
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Could not extract any text from the file." }, { status: 400 });
    }

    if (!CEREBRAS_API_KEY) {
      return NextResponse.json({ error: "Cerebras API key not configured." }, { status: 500 });
    }

    const cerebRes = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CEREBRAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are a CV parsing assistant. Extract structured information from the CV text below and return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "skills": string[],
  "experience": { "company": string, "role": string, "start_date": string, "end_date": string, "description": string }[],
  "education": { "institution": string, "degree": string, "year": number }[],
  "years_of_experience": number,
  "current_role": string,
  "location": string
}
Use empty arrays and empty strings for missing data. Never invent information.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!cerebRes.ok) {
      const errBody = await cerebRes.text();
      console.error("Cerebras API error:", cerebRes.status, errBody);
      return NextResponse.json({ error: "AI extraction failed. Please try again." }, { status: 502 });
    }

    const cerebData = await cerebRes.json();
    const content = cerebData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: "Empty response from AI." }, { status: 502 });
    }

    const cleaned = content.replace(/```(?:json)?\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      ...parsed,
      cv_text: text.slice(0, 10000),
    });
  } catch (err) {
    console.error("Extract CV error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
