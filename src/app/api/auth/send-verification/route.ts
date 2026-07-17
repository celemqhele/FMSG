import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateCode, hashCode } from "@/lib/verification-code";
import { sendVerificationEmail } from "@/lib/mailtrap";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(`send-verify:${user.id}`, "send-verify");
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please wait before requesting a new code." }, { status: 429 });
    }

    const email = user.email;
    if (!email) {
      return NextResponse.json({ error: "No email on account" }, { status: 400 });
    }

    const code = generateCode();
    const hash = await hashCode(code, email);

    const { error: updateErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, email_verification_hash: hash }, { onConflict: "id" });

    if (updateErr) {
      console.error("[SEND-VERIFY] DB update failed:", updateErr);
      return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
    }

    const { ok, error: mailErr } = await sendVerificationEmail(email, code);
    if (!ok) {
      console.error("[SEND-VERIFY] Mailtrap failed:", mailErr);
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[SEND-VERIFY]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
