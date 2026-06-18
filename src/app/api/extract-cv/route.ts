import { NextRequest, NextResponse } from "next/server";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const MODEL = "qwen-3-32b";

function polyfillDOMMatrix() {
  if (globalThis.DOMMatrix) return;
  // Minimal DOMMatrix polyfill for pdfjs-dist in Node.js
  class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: string | number[]) {
      if (typeof init === "string") {
        const m = init.match(/matrix\(([^)]+)\)/)?.[1]?.split(",").map(Number);
        if (m && m.length === 6) {
          this.a = m[0]; this.b = m[1]; this.c = m[2]; this.d = m[3]; this.e = m[4]; this.f = m[5];
        }
      }
    }
    translate(tx: number, ty: number) {
      this.e += tx; this.f += ty;
      return this;
    }
    scale(sx: number, sy: number) {
      this.a *= sx; this.b *= sx; this.c *= sy; this.d *= sy;
      return this;
    }
    multiply(other: DOMMatrix) {
      const { a, b, c, d, e, f } = this;
      this.a = a * other.a + c * other.b;
      this.b = b * other.a + d * other.b;
      this.c = a * other.c + c * other.d;
      this.d = b * other.c + d * other.d;
      this.e = a * other.e + c * other.f + e;
      this.f = b * other.e + d * other.f + f;
      return this;
    }
    inverse() {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) throw new Error("DOMMatrix: not invertible");
      const inv = Object.assign(Object.create(DOMMatrix.prototype), {
        a: this.d / det, b: -this.b / det, c: -this.c / det, d: this.a / det,
        e: (this.c * this.f - this.d * this.e) / det,
        f: (this.b * this.e - this.a * this.f) / det,
      });
      return inv;
    }
    rotate(angle: number) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad); const sin = Math.sin(rad);
      const { a, b, c, d, e, f } = this;
      this.a = a * cos + c * sin;
      this.b = b * cos + d * sin;
      this.c = a * -sin + c * cos;
      this.d = b * -sin + d * cos;
      this.e = e; this.f = f;
      return this;
    }
    rotateAxisAngle(_x: number, _y: number, _z: number, angle: number) {
      return this.rotate(angle);
    }
    toString() {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
    static fromString(s: string) {
      return new DOMMatrix(s);
    }
  }
  globalThis.DOMMatrix = DOMMatrix as any;
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  polyfillDOMMatrix();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
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
      let detail = "AI extraction failed. ";
      if (cerebRes.status === 401) detail += "Invalid API key.";
      else if (cerebRes.status === 429) detail += "Rate limited. Try again later.";
      else if (cerebRes.status >= 500) detail += "Cerebras server error.";
      else detail += `Status ${cerebRes.status}.`;
      return NextResponse.json({ error: detail, code: "CEREBRAS_API_ERROR", status: cerebRes.status }, { status: 502 });
    }

    const cerebData = await cerebRes.json();
    const content = cerebData.choices?.[0]?.message?.content;

    if (!content) {
      console.error("Cerebras returned empty content:", JSON.stringify(cerebData));
      return NextResponse.json({ error: "Empty response from AI. The model may have been interrupted.", code: "EMPTY_RESPONSE" }, { status: 502 });
    }

    const cleaned = content.replace(/```(?:json)?\s*/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Cerebras response as JSON. Raw:", content.slice(0, 500));
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
