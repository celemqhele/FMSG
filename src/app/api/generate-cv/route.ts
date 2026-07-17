import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { extractText } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  ShadingType,
} from "docx";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface CvData {
  name: string;
  professionalTitle: string;
  phoneEmail: string;
  locationAvailability: string;
  professionalSummary: string;
  skills: { category: string; description: string }[];
  experience: {
    jobTitle: string;
    company: string;
    location: string;
    dates: string;
    summary: string;
    sections: { subHeading: string; bullets: string[] }[];
  }[];
  education: { qualification: string; institution: string; year: string }[];
  professionalDevelopment: string[];
  references: { name: string; details: string }[];
  personalInfo: Record<string, string>;
}

// ========================
// COLOUR PALETTE & SIZES
// ========================
const DARK_TEXT = "1A1A1A";
const TEAL = "1F6B7F";
const MEDIUM_GREY = "555555";
const WHITE = "FFFFFF";

const SIZE_NAME = 56;       // 28pt
const SIZE_SECTION = 21;    // 10.5pt
const SIZE_BODY = 20;       // 10pt
const SIZE_SMALL = 18;      // 9pt

// ========================
// DOCX BUILDERS
// ========================

function headerBlock(name: string, title: string, phoneEmail: string, locationAvailability: string) {
  return [
    new Paragraph({
      spacing: { after: 60, before: 0 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: name, font: "Calibri", size: SIZE_NAME, bold: true, color: DARK_TEXT })],
    }),
    new Paragraph({
      spacing: { after: 60, before: 0 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, font: "Calibri", size: SIZE_BODY, bold: true, color: TEAL })],
    }),
    new Paragraph({
      spacing: { after: 40, before: 0 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: phoneEmail, font: "Calibri", size: SIZE_SMALL, color: MEDIUM_GREY })],
    }),
    new Paragraph({
      spacing: { after: 80, before: 0 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: locationAvailability, font: "Calibri", size: SIZE_SMALL, color: MEDIUM_GREY })],
    }),
  ];
}

function sectionHeader(title: string) {
  return new Paragraph({
    spacing: { after: 80, before: 160 },
    shading: { type: ShadingType.CLEAR, fill: TEAL },
    children: [new TextRun({ text: title, font: "Calibri", size: SIZE_SECTION, bold: true, color: WHITE })],
  });
}

function bodyText(text: string, opts?: { spacing?: Record<string, number>; italic?: boolean }) {
  return new Paragraph({
    spacing: opts?.spacing ?? { before: 40, after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: "Calibri", size: SIZE_BODY, color: DARK_TEXT, ...(opts?.italic ? { italics: true } : {}) })],
  });
}

function skillLine(category: string, description: string) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      new TextRun({ text: category + ": ", font: "Calibri", size: SIZE_BODY, bold: true, color: DARK_TEXT }),
      new TextRun({ text: description, font: "Calibri", size: SIZE_BODY, color: DARK_TEXT }),
    ],
  });
}

function jobTitleLine(title: string, company: string, location: string) {
  return new Paragraph({
    spacing: { before: 120, after: 30 },
    children: [
      new TextRun({ text: title, font: "Calibri", size: SIZE_BODY, bold: true, color: DARK_TEXT }),
      new TextRun({
        text: `  |  ${company}${location ? `  |  ${location}` : ""}`,
        font: "Calibri", size: SIZE_BODY, color: MEDIUM_GREY,
      }),
    ],
  });
}

function dateLine(date: string) {
  return new Paragraph({
    spacing: { before: 30, after: 30 },
    children: [new TextRun({ text: date, font: "Calibri", size: SIZE_SMALL, color: MEDIUM_GREY })],
  });
}

function roleSummary(text: string) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: "Calibri", size: SIZE_BODY, italics: true, color: DARK_TEXT })],
  });
}

function roleSubHeading(text: string) {
  return new Paragraph({
    spacing: { before: 100, after: 40 },
    children: [new TextRun({ text, font: "Calibri", size: SIZE_BODY, bold: true, italics: true, color: TEAL })],
  });
}

function bulletPoint(text: string) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    bullet: { level: 0 },
    children: [new TextRun({ text, font: "Calibri", size: SIZE_BODY, color: DARK_TEXT })],
  });
}

function educationItem(qualification: string, institution: string, year: string) {
  return [
    new Paragraph({
      spacing: { before: 60, after: 20 },
      children: [new TextRun({ text: qualification, font: "Calibri", size: SIZE_BODY, bold: true, color: DARK_TEXT })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: `${institution}  |  ${year}`, font: "Calibri", size: SIZE_SMALL, color: MEDIUM_GREY })],
    }),
  ];
}

function eduSubHeading(text: string) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Calibri", size: SIZE_BODY, bold: true, italics: true, color: TEAL })],
  });
}

function referenceLine(name: string, details: string) {
  return new Paragraph({
    spacing: { before: 60, after: 40 },
    children: [
      new TextRun({ text: name, font: "Calibri", size: SIZE_BODY, bold: true, color: DARK_TEXT }),
      new TextRun({ text: `  |  ${details}`, font: "Calibri", size: SIZE_SMALL, color: MEDIUM_GREY }),
    ],
  });
}

function personalInfoLine(label: string, value: string) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      new TextRun({ text: label + ": ", font: "Calibri", size: SIZE_BODY, bold: true, color: DARK_TEXT }),
      new TextRun({ text: value, font: "Calibri", size: SIZE_BODY, color: DARK_TEXT }),
    ],
  });
}

function blankLine(spacing: Record<string, number> = {}) {
  return new Paragraph({ spacing, children: [] });
}

function buildDoc(data: CvData): Document {
  const children: Paragraph[] = [];

  // --- HEADER ---
  children.push(...headerBlock(data.name, data.professionalTitle, data.phoneEmail, data.locationAvailability));

  // --- PROFESSIONAL SUMMARY ---
  children.push(sectionHeader("Professional Summary"));
  children.push(bodyText(data.professionalSummary, { spacing: { before: 80, after: 80 } }));

  // --- SKILLS ---
  children.push(sectionHeader("Skills"));
  children.push(blankLine({ before: 60, after: 0 }));
  for (const skill of data.skills) {
    children.push(skillLine(skill.category, skill.description));
  }
  children.push(blankLine({ before: 60, after: 0 }));

  // --- WORK EXPERIENCE ---
  if (data.experience?.length) {
    children.push(sectionHeader("Work Experience"));
    for (const role of data.experience) {
      children.push(jobTitleLine(role.jobTitle, role.company, role.location));
      children.push(dateLine(role.dates));
      if (role.summary) {
        children.push(roleSummary(role.summary));
      }
      for (const section of role.sections || []) {
        if (section.subHeading) {
          children.push(roleSubHeading(section.subHeading));
        }
        for (const bullet of section.bullets || []) {
          children.push(bulletPoint(bullet));
        }
      }
    }
  }

  // --- EDUCATION & CERTIFICATIONS ---
  children.push(sectionHeader("Education & Certifications"));
  children.push(blankLine({ before: 60, after: 0 }));
  for (const edu of data.education) {
    children.push(...educationItem(edu.qualification, edu.institution, edu.year));
  }
  if (data.professionalDevelopment?.length) {
    children.push(eduSubHeading("Professional Development"));
    for (const item of data.professionalDevelopment) {
      children.push(bulletPoint(item));
    }
  }
  children.push(blankLine({ before: 60, after: 0 }));

  // --- REFERENCES ---
  children.push(sectionHeader("References"));
  children.push(blankLine({ before: 60, after: 0 }));
  for (const ref of data.references || []) {
    children.push(referenceLine(ref.name, ref.details));
  }
  children.push(blankLine({ before: 60, after: 0 }));

  // --- PERSONAL INFORMATION ---
  if (data.personalInfo && Object.keys(data.personalInfo).length > 0) {
    children.push(sectionHeader("Personal Information"));
    children.push(blankLine({ before: 60, after: 0 }));
    for (const [label, value] of Object.entries(data.personalInfo)) {
      children.push(personalInfoLine(label, value));
    }
    children.push(blankLine({ before: 60, after: 0 }));
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, right: 1080, bottom: 720, left: 1080 },
        },
      },
      children,
    }],
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

    const rl = checkRateLimit(`generate:${user.id}`, "generate");
    if (!rl.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: `Too many CV generations. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("cv_generation_balance, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: "Failed to fetch profile." }, { status: 500 });
    }

    const isAdmin = (profile as any)?.is_admin ?? false;

    if (!isAdmin) {
      const balance = (profile as any)?.cv_generation_balance ?? 0;
      if (balance <= 0) {
        return NextResponse.json({ code: "LIMIT_002", message: "No CV generation credits remaining." }, { status: 403 });
      }
    }

    const { job_result_id } = await request.json();
    if (!job_result_id) {
      return NextResponse.json({ error: "Missing job_result_id" }, { status: 400 });
    }

    const { data: jobRow, error: jobErr } = await supabase
      .from("job_results")
      .select("job_title, company, full_spec, search_query, profile_id, suggested_cv")
      .eq("id", job_result_id)
      .maybeSingle();

    if (jobErr || !jobRow) {
      return NextResponse.json({ error: "Job result not found" }, { status: 404 });
    }

    const fullSpec = (jobRow as any).full_spec ?? "";
    const jobTitle = (jobRow as any).job_title ?? "";
    const company = (jobRow as any).company ?? "";
    const jobProfileId = (jobRow as any).profile_id;
    const suggestedCv = (jobRow as any).suggested_cv ?? "";

    // Determine which CV variation to use
    let cvFilePath = "";
    if (jobProfileId) {
      const { data: sp, error: spErr } = await supabase
        .from("search_profiles")
        .select("cv_variations")
        .eq("id", jobProfileId)
        .maybeSingle();
      if (!spErr) {
        const variations: { name: string; file_path: string }[] = (sp as any)?.cv_variations ?? [];
        if (variations.length > 0) {
          if (suggestedCv) {
            const match = variations.find((v) => v.name === suggestedCv);
            cvFilePath = match?.file_path ?? variations[0].file_path;
          } else {
            cvFilePath = variations[0].file_path;
          }
        }
      }
    }
    if (!cvFilePath) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("cv_file_path")
        .eq("id", user.id)
        .maybeSingle();
      cvFilePath = (profileRow as any)?.cv_file_path ?? "";
    }

    // Extract CV text
    let cvText = "";
    if (cvFilePath) {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage.from("cv-files").download(cvFilePath);
        if (!dlErr && fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          cvText = await extractText(buffer, cvFilePath);
        }
      } catch {
        // CV unavailable — proceed with empty
      }
    }

    // AI prompt — CV Strategist (from prompt.md)
    const systemPrompt = `You are a professional CV strategist. Transform the candidate's existing CV into a tailored, results-driven document that maximises ATS compatibility (target >=85% match), improves recruiter readability, and positions the candidate as a strong match for the target role. Do not fabricate achievements or numbers.

## OBJECTIVE
Reconstruct and enhance the CV to appear as the perfect fit for the provided job post. Think critically, reason independently, and position the profile to clearly show value and alignment. Do not fabricate achievements.

## TASK
Study the job post and CV carefully. Reframe, reposition, and restructure experience, achievements, and credentials so the CV directly reflects the employer's needs. Emphasise, condense, reword, or move content where appropriate.

## STRATEGIC GUIDELINES

### Positioning & Tone
- Do not fabricate numbers or achievements.
- Mirror the job description's tone, structure, and key terms.
- You may update job titles to better match industry-standard naming conventions (no inflation).
- Frame experience around measurable outcomes, leadership scope, and contributions to growth or improvement.
- Use CAR framework (Challenge / Action / Result) for experience bullets.

### Language & Localisation
- Use UK/SA English if the CV references local regions.
- Maintain a clean, professional tone — no clichés or filler.
- No em dashes in any output. Use commas, colons, or restructured sentences instead.

## FORMATTING & ATS
- Use simple text structure only: no tables, columns, symbols, or graphics.
- Keep clear headings and consistent formatting for ATS parsing.
- Date format: Mon YYYY – Mon YYYY for roles; Mon YYYY for education.
- Experience bullets: ~75–100 characters max, using CAR framework.
- Quantify where natural — no made-up numbers.

## STRUCTURE TO USE

### Contact Information
Extract from the CV or use placeholders:
[Name Surname] | [Professional Title] | [Phone] | [Email] | [LinkedIn] | [Location] | Available: [Date/Immediate]

### Professional Summary (150-200 words)
Summarise the candidate as the ideal fit for the target role. Include:
- Years of relevant experience
- 2-3 specialisations that match the role
- A short value proposition / differentiator
- One notable, measurable achievement
- Forward-looking statement of value

### Core Competencies
Contextual categories from the job description. Format:
- [Primary Requirement Category]: [Skills], [Related], [Supporting]
- [Secondary Requirement Category]: [Skills], [Related], [Supporting]
- [Technical/Systems Category]: [Software], [Tools], [Platforms]

### Professional Experience (Top 2-3 most relevant roles)
Sort by relevance to the target role (not strictly chronological). Format each role:
JOB TITLE — COMPANY NAME | [Company context if relevant] | Mon YYYY – Mon YYYY
[Italic summary of role and relevance]
Key Focus Area heading (teal, bold italic):
- [Action] + [Achievement] + [Impact/Outcome] + [Relevance]
- [Challenge] + [Approach] + [Result/Value delivered]

### Education & Professional Development
QUALIFICATION | INSTITUTION | YYYY
Include all relevant training or certifications.

### References
Include if present in the original CV; otherwise: "References available on request."

## ATS OPTIMISATION
- Integrate job posting keywords naturally across the document.
- Keep standard section headings for ATS parsing.
- Avoid keyword stuffing — use relevant, natural phrasing.
- Use accurate industry terminology that recruiters expect.

## QUALITY GATE
Before finalising, evaluate:
- Requirements Match: Does the CV meet the role's stated criteria?
- ATS Compatibility: Likelihood of passing ATS filters (target >=85%).
- Positioning: Does the presentation justify the candidate's target level?

Return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "name": "First Last",
  "professionalTitle": "Professional Title | Specialisation | Industry Keywords",
  "phoneEmail": "000 000 0000  |  email@domain.co.za",
  "locationAvailability": "City, Province  |  Available Immediately",
  "professionalSummary": "150-200 word summary tailored to the role",
  "skills": [
    { "category": "Requirement Category", "description": "Skills, related competencies, supporting knowledge" }
  ],
  "experience": [
    {
      "jobTitle": "JOB TITLE",
      "company": "Company Name",
      "location": "City, Province",
      "dates": "Mon YYYY – Mon YYYY",
      "summary": "Italic overview of the role and relevance to target position",
      "sections": [
        {
          "subHeading": "Key Focus Area",
          "bullets": [
            "Achievement using CAR framework with impact and relevance",
            "Challenge, approach, result with scale or scope context"
          ]
        }
      ]
    }
  ],
  "education": [
    { "qualification": "Degree / Qualification Name", "institution": "Institution Name", "year": "YYYY" }
  ],
  "professionalDevelopment": [
    "Training / Certification Name — Institution — YYYY"
  ],
  "references": [
    { "name": "Reference Name", "details": "Title, Organisation  |  Phone  |  Email" }
  ],
  "personalInfo": {
    "Location": "City, Province, Country",
    "Availability": "Immediately available",
    "Work Arrangement": "On-site, hybrid, or remote"
  }
}

Use the job spec to identify what skills and experience to emphasise. Use the CV for facts only — do not invent.`;

    const userText = `JOB SPEC:\n${fullSpec.slice(0, 10000)}\n\nCANDIDATE CV:\n${cvText.slice(0, 10000)}`;

    let content = "";
    try {
      content = await callAIWithFallback(systemPrompt, userText, "CV generation", { responseMimeType: "application/json", temperature: 0.1 });
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

    // Build DOCX with teal-bar design
    const doc = buildDoc(parsed);
    const buffer = await Packer.toBuffer(doc);

    // Decrement balance (skip if admin)
    if (!isAdmin) {
      const { error: decErr } = await supabase.rpc("decrement_cv_balance", {
        p_user_id: user.id,
        p_amount: 1,
      });
      if (decErr) {
        console.error("[GENERATE-CV] Failed to decrement balance:", decErr.message);
      }
    }

    const filename = `CV - ${parsed.name || jobTitle} - ${company} - FMSG.docx`.replace(/[/\\?%*:|"<>]/g, "_");
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
