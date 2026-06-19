import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractTextFromPDF } from "@/lib/pdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface CvData {
  summary: string;
  skills: { category: string; items: string }[];
  experience: { title: string; company: string; dates: string; bullets: string[] }[];
  achievements: string[];
  education: { qualification: string; institution: string; year: string }[];
}

const ACCENT = "1F6B7F";

function buildDoc(data: CvData): Document {
  const children: (Paragraph | Table)[] = [];

  // Name placeholder — caller can edit
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Generated CV", bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  // Contact bar
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Phone • Email • LinkedIn • Location", size: 18, color: "555555" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Summary
  if (data.summary) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Professional Summary", bold: true, size: 22, color: ACCENT })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT } },
      }),
      new Paragraph({
        children: [new TextRun({ text: data.summary, size: 20 })],
        spacing: { after: 200 },
      })
    );
  }

  // Skills
  if (data.skills?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Skills & Expertise", bold: true, size: 22, color: ACCENT })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT } },
      })
    );
    for (const s of data.skills) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: s.category, bold: true, size: 20 }),
            new TextRun({ text: `  ${s.items}`, size: 20 }),
          ],
          spacing: { after: 60 },
        })
      );
    }
  }

  // Experience
  if (data.experience?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Experience", bold: true, size: 22, color: ACCENT })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT } },
      })
    );
    for (const e of data.experience) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: e.title, bold: true, size: 20 }),
            new TextRun({ text: `  at  ${e.company}`, size: 20 }),
          ],
          spacing: { after: 0 },
        }),
        new Paragraph({
          children: [new TextRun({ text: e.dates, size: 18, color: "555555" })],
          spacing: { after: 60 },
        })
      );
      for (const b of e.bullets) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `• ${b}`, size: 20 })],
            spacing: { after: 40 },
            indent: { left: 400 },
          })
        );
      }
    }
  }

  // Achievements
  if (data.achievements?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Key Achievements", bold: true, size: 22, color: ACCENT })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT } },
      })
    );
    for (const a of data.achievements) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${a}`, size: 20 })],
          spacing: { after: 40 },
          indent: { left: 400 },
        })
      );
    }
  }

  // Education
  if (data.education?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Education", bold: true, size: 22, color: ACCENT })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT } },
      })
    );
    for (const ed of data.education) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: ed.qualification, bold: true, size: 20 }),
          ],
          spacing: { after: 0 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: ed.institution, size: 20 }),
            new TextRun({ text: `  •  ${ed.year}`, size: 20, color: "555555" }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  }

  return new Document({
    sections: [{ children }],
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();

    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;

    // Auth + balance check (skip if admin)
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("cv_generation_balance")
        .eq("id", user.id)
        .maybeSingle();
      const balance = (profile as any)?.cv_generation_balance ?? 0;
      if (balance <= 0) {
        return NextResponse.json({ code: "LIMIT_001", message: "No CV generation credits remaining." }, { status: 403 });
      }
    }

    const { job_result_id } = await request.json();
    if (!job_result_id) {
      return NextResponse.json({ error: "Missing job_result_id" }, { status: 400 });
    }

    // Fetch job_result row
    const { data: jobRow, error: jobErr } = await supabase
      .from("job_results")
      .select("job_title, company, full_spec, search_query, profile_id")
      .eq("id", job_result_id)
      .maybeSingle();

    if (jobErr || !jobRow) {
      return NextResponse.json({ error: "Job result not found" }, { status: 404 });
    }

    const fullSpec = (jobRow as any).full_spec ?? "";
    const jobTitle = (jobRow as any).job_title ?? "";
    const company = (jobRow as any).company ?? "";
    const jobProfileId = (jobRow as any).profile_id;

    // Look up CV from the search_profile that was used for this search,
    // falling back to the main profile's cv_file_path for older results
    let cvFilePath = "";
    if (jobProfileId) {
      const { data: sp } = await supabase
        .from("search_profiles")
        .select("cv_file_path")
        .eq("id", jobProfileId)
        .maybeSingle();
      cvFilePath = (sp as any)?.cv_file_path ?? "";
    }
    if (!cvFilePath) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("cv_file_path")
        .eq("id", user.id)
        .maybeSingle();
      cvFilePath = (profileRow as any)?.cv_file_path ?? "";
    }

    // Fetch and extract CV text
    let cvText = "";
    if (cvFilePath) {
      try {
        const { data: fileData } = await supabase.storage.from("cv-files").download(cvFilePath);
        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          cvText = await extractTextFromPDF(buffer);
        }
      } catch {
        // CV unavailable — proceed with empty
      }
    }

    // AI call (Gemini → Groq fallback)
    const prompt = `Reconstruct this CV to be the strongest possible match for the job spec below.
Do not invent achievements or numbers. Mirror the job's tone and key terms.
Use UK/SA English. Plain text only, no tables or symbols.
Target ATS compatibility 85%+.

Return JSON only:
{
  "summary": "",
  "skills": [{ "category": "", "items": "" }],
  "experience": [{ "title": "", "company": "", "dates": "", "bullets": [""] }],
  "achievements": [""],
  "education": [{ "qualification": "", "institution": "", "year": "" }]
}

JOB SPEC:
${fullSpec.slice(0, 10000)}

CANDIDATE CV:
${cvText.slice(0, 10000)}`;

    let content = "";
    try {
      content = await callAIWithFallback(prompt, "Generate the tailored CV JSON.", "CV generation", { responseMimeType: "application/json", temperature: 0.1 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI error:", msg);
      if (msg.includes("503")) {
        return NextResponse.json({ error: "Service temporarily unavailable. Please try again in 30 minutes.", code: "AI_OVERLOADED" }, { status: 503 });
      }
      return NextResponse.json({ error: "AI generation failed. Please try again." }, { status: 502 });
    }

    if (!content) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    const cleaned = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1).trim();
    let parsed: CvData;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON." }, { status: 502 });
    }

    // Build docx
    const doc = buildDoc(parsed);
    const buffer = await Packer.toBuffer(doc);

    // Decrement balance (skip if admin)
    if (!isAdmin) {
      const { data: current } = await supabase
        .from("profiles")
        .select("cv_generation_balance")
        .eq("id", user.id)
        .maybeSingle();
      const curBalance = (current as any)?.cv_generation_balance ?? 0;
      if (curBalance > 0) {
        await supabase
          .from("profiles")
          .update({ cv_generation_balance: curBalance - 1 })
          .eq("id", user.id);
      }
    }

    // Return file
    const filename = `CV - ${jobTitle} - ${company} - FMSG.docx`.replace(/[/\\?%*:|"<>]/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GENERATE-CV] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
