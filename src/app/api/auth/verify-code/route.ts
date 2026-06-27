import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyCode } from "@/lib/verification-code";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body as { code?: string };

    if (!code || typeof code !== "string" || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = user.email;
    if (!email) {
      return NextResponse.json({ error: "No email on account" }, { status: 400 });
    }

    const { allowed } = checkRateLimit(`verify:${user.id}`, "verify");
    if (!allowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429 });
    }

    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select("email_verification_hash")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchErr || !profile?.email_verification_hash) {
      return NextResponse.json({ error: "Code expired or not requested. Please request a new one." }, { status: 400 });
    }

    const valid = await verifyCode(code, email, profile.email_verification_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid code. Please try again." }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ email_verified: true, email_verification_hash: null })
      .eq("id", user.id);

    if (updateErr) {
      console.error("[VERIFY-CODE] DB update failed:", updateErr);
      return NextResponse.json({ error: "Failed to verify email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[VERIFY-CODE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
