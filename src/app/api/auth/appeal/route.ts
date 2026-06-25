import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAppealEmail } from "@/lib/mailtrap";

function getIP(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "127.0.0.1";
}

export async function POST(request: NextRequest) {
  try {
    const ip = getIP(request);
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reason } = body as { reason?: string };

    if (!reason || typeof reason !== "string" || reason.trim().length < 20) {
      return NextResponse.json({ error: "Please provide at least 20 characters explaining your situation." }, { status: 400 });
    }

    const { allowed } = checkRateLimit(`appeal:${ip}`, "appeal");
    if (!allowed) {
      return NextResponse.json({ error: "You have already submitted an appeal. Please wait before submitting another." }, { status: 429 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ok, error: mailErr } = await sendAppealEmail(
      user.email ?? "unknown",
      user.id,
      ip,
      reason.trim()
    );

    if (!ok) {
      console.error("[APPEAL] Email failed:", mailErr);
      return NextResponse.json({ error: "Failed to submit appeal. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Appeal submitted. We will review it within 24 hours." });
  } catch (err) {
    console.error("[APPEAL]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
