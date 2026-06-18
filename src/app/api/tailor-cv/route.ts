import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callGemini } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const TAILOR_PROMPT = `You are a professional CV writer. Given the user's CV text and a full job description, rewrite the user's CV to highlight the most relevant experience, skills, and achievements for this specific role. Focus on matching keywords from the job description while keeping all information truthful.

Return ONLY valid JSON with this exact schema:
{
  "name": string,
  "surname": string,
  "phone": string,
  "email": string,
  "professional_summary": string,
  "skills": string[],
  "experience": { "company": string, "role": string, "start_date": string, "end_date": string, "description": string }[],
  "education": { "institution": string, "degree": string, "year": number }[]
}`;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { job_description, job_title, company } = await request.json();
    if (!job_description) {
      return NextResponse.json({ error: "Job description required." }, { status: 400 });
    }

    const isAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;

    // Get profile for CV file path
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.cv_file_path) {
      return NextResponse.json({ error: "No CV found. Upload one first." }, { status: 400 });
    }

    // Balance check
    if (!isAdmin) {
      const balance = profile.cv_generation_balance ?? 0;
      if (balance <= 0) {
        return NextResponse.json({ error: "LIMIT_002", code: "LIMIT_002" }, { status: 403 });
      }
    }

    // Decrement balance
    if (!isAdmin) {
      await supabase
        .from("profiles")
        .update({ cv_generation_balance: (profile.cv_generation_balance ?? 5) - 1 })
        .eq("id", user.id);
    }

    // Fetch raw PDF from Storage
    const { data: pdfData, error: dlErr } = await supabase.storage
      .from("cv-files")
      .download(profile.cv_file_path);

    if (dlErr || !pdfData) {
      return NextResponse.json({ error: "Failed to retrieve CV file." }, { status: 500 });
    }

    // Extract text from PDF
    const buffer = Buffer.from(await pdfData.arrayBuffer());
    let cvText: string;
    try {
      cvText = await extractTextFromPDF(buffer);
    } catch {
      return NextResponse.json({ error: "Failed to read CV content." }, { status: 500 });
    }

    // Send to Gemini
    const input = `CV: ${cvText}\n\nJob Title: ${job_title ?? "N/A"}\nCompany: ${company ?? "N/A"}\n\nJob Description: ${job_description}`;
    let result: string;
    try {
      result = await callGemini(TAILOR_PROMPT, input, { responseMimeType: "application/json" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `AI tailoring failed. ${msg}` }, { status: 502 });
    }

    const cleaned = result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "AI returned invalid format." }, { status: 502 });
    }

    // Generate Word document
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${parsed.name ?? ""} ${parsed.surname ?? ""}`, bold: true, size: 32 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: [parsed.phone, parsed.email].filter(Boolean).join(" | "), size: 20 }),
            ],
          }),
          new Paragraph({ spacing: { after: 400 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Professional Summary", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: parsed.professional_summary ?? "" })], spacing: { after: 400 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Skills", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: (parsed.skills ?? []).join(", ") })], spacing: { after: 400 } }),

          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Experience", bold: true })] }),
          ...(parsed.experience ?? []).flatMap((exp: any) => [
            new Paragraph({ children: [new TextRun({ text: exp.role, bold: true }), new TextRun({ text: ` at ${exp.company}` })] }),
            new Paragraph({ children: [new TextRun({ text: `${exp.start_date} - ${exp.end_date}`, italics: true, size: 20 })] }),
            new Paragraph({ children: [new TextRun({ text: exp.description })], spacing: { after: 200 } }),
          ]),

          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Education", bold: true })] }),
          ...(parsed.education ?? []).flatMap((edu: any) => [
            new Paragraph({ children: [new TextRun({ text: edu.degree, bold: true }), new TextRun({ text: ` — ${edu.institution}` })] }),
            new Paragraph({ children: [new TextRun({ text: String(edu.year), italics: true, size: 20 })], spacing: { after: 200 } }),
          ]),
        ],
      }],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(docxBuffer);

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${job_title ?? "CV"}_${company ?? "tailored"}.docx"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Tailor CV error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
