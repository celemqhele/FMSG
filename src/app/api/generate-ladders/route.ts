import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractTextFromPDF } from "@/lib/pdf";
import { debugLog } from "@/lib/debug";
import { generateIndustryLadder, generateTitleLadders, upsertIndustryLadder } from "@/lib/career-ladders";

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
    if (!body?.profile_id) {
      return NextResponse.json({ error: "profile_id is required." }, { status: 400 });
    }

    const profileId = body.profile_id as string;
    const forceRegenerate = body.force ?? false;

    const { data: searchProfile } = await supabase
      .from("search_profiles")
      .select("id, cv_variations, industry, job_titles, last_analysed_at")
      .eq("id", profileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!searchProfile) {
      return NextResponse.json({ error: "Search profile not found." }, { status: 404 });
    }

    if (!forceRegenerate && searchProfile.last_analysed_at) {
      return NextResponse.json({ success: true, cached: true, message: "Ladders already cached." });
    }

    const cvVariations: Array<{ name?: string; label?: string; file_path: string }> =
      (searchProfile as any).cv_variations ?? [];

    if (cvVariations.length === 0) {
      return NextResponse.json({ error: "No CVs uploaded yet." }, { status: 400 });
    }

    const profileIndustry = searchProfile.industry ?? "";
    const profileTitles: string[] = (searchProfile as any).job_titles ?? [];

    // ─── Generate industry ladder (profile-level) ──────────────────────────
    let industryLadderSteps: { step_1: string; step_2: string; step_3: string; step_4: string; step_5: string } | null = null;

    if (profileIndustry?.trim()) {
      try {
        const steps = await generateIndustryLadder(profileIndustry);
        await upsertIndustryLadder(user.id, steps);
        industryLadderSteps = steps;

        const broadest = steps.step_5 || steps.step_4 || profileIndustry;
        await supabase.from("profiles").update({ industry: broadest }).eq("id", user.id);
        await supabase.from("search_profiles").update({ industry: broadest }).eq("id", profileId);
      } catch (err) {
        debugLog(`[LADDER] Industry ladder generation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ─── Generate title ladders per CV ─────────────────────────────────────
    const updatedCvVariations: Array<{
      label: string;
      file_path: string;
      title_ladders: Record<string, string[]>;
      title_ladder_generated_at: string;
    }> = [];

    const existingLabels: string[] = [];

    for (const cv of cvVariations) {
      if (!cv.file_path) continue;

      const cvLabel = cv.label || cv.name || "CV";

      try {
        const { data: fileData } = await supabase.storage
          .from("cv-files")
          .download(cv.file_path);

        if (!fileData) {
          updatedCvVariations.push({
            label: cvLabel,
            file_path: cv.file_path,
            title_ladders: {},
            title_ladder_generated_at: new Date().toISOString(),
          });
          existingLabels.push(cvLabel);
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const cvText = await extractTextFromPDF(buffer);

        if (!cvText.trim()) {
          updatedCvVariations.push({
            label: cvLabel,
            file_path: cv.file_path,
            title_ladders: {},
            title_ladder_generated_at: new Date().toISOString(),
          });
          existingLabels.push(cvLabel);
          continue;
        }

        const result = await generateTitleLadders(profileTitles, cvText, existingLabels);
        updatedCvVariations.push({
          label: result.cv_label || cvLabel,
          file_path: cv.file_path,
          title_ladders: result.title_ladders,
          title_ladder_generated_at: new Date().toISOString(),
        });
        existingLabels.push(result.cv_label || cvLabel);
      } catch (err) {
        debugLog(`[LADDER] Title ladder generation failed for ${cvLabel}: ${err instanceof Error ? err.message : String(err)}`);
        const fallback: Record<string, string[]> = {};
        for (const title of profileTitles) {
          fallback[title] = [title, title, title, title, title];
        }
        updatedCvVariations.push({
          label: cvLabel,
          file_path: cv.file_path,
          title_ladders: fallback,
          title_ladder_generated_at: new Date().toISOString(),
        });
        existingLabels.push(cvLabel);
      }
    }

    await supabase
      .from("search_profiles")
      .update({
        cv_variations: updatedCvVariations,
        needs_reanalysis: false,
        last_analysed_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    debugLog(`[LADDER] Cached ${updatedCvVariations.length} CV title ladders + industry ladder for user ${user.id}`);

    return NextResponse.json({
      success: true,
      industry_ladder: industryLadderSteps
        ? [industryLadderSteps.step_1, industryLadderSteps.step_2, industryLadderSteps.step_3, industryLadderSteps.step_4, industryLadderSteps.step_5]
        : null,
      cv_count: updatedCvVariations.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog(`[LADDER] Generate ladders error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
