import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: alreadyBlocked } = await supabase
      .from("blocked_ips")
      .select("id")
      .eq("ip", ip)
      .maybeSingle();

    if (alreadyBlocked) {
      await supabase
        .from("profiles")
        .update({ signup_ip: ip, account_status: "blocked" })
        .eq("id", user.id);
      return NextResponse.json({ ok: true });
    }

    await supabase
      .from("profiles")
      .update({ signup_ip: ip })
      .eq("id", user.id);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error: countErr } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("signup_ip", ip)
      .gte("created_at", twentyFourHoursAgo);

    if (!countErr && count !== null && count >= 5) {
      const { error: blockErr } = await supabase
        .from("blocked_ips")
        .upsert({ ip, reason: "Excessive signups from IP" });

      if (!blockErr) {
        await supabase
          .from("profiles")
          .update({ account_status: "blocked" })
          .eq("signup_ip", ip)
          .gte("created_at", twentyFourHoursAgo);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[RECORD-SIGNUP]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
