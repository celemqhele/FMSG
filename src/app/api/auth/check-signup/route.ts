import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkVPN } from "@/lib/vpn-detect";
import { createClient } from "@supabase/supabase-js";

function getIP(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "127.0.0.1";
}

export async function POST(request: NextRequest) {
  const ip = getIP(request);

  const { allowed, remaining } = checkRateLimit(`check-signup:${ip}`, "signup");
  if (!allowed) {
    return NextResponse.json({ allowed: false, reason: "Too many signup attempts. Please try again later." }, { status: 429 });
  }

  const vpn = await checkVPN(ip);
  if (vpn.isSuspicious) {
    return NextResponse.json({ allowed: false, reason: "VPN or proxy detected. Please disable it and try again." });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: blocked } = await supabase
    .from("blocked_ips")
    .select("ip")
    .eq("ip", ip)
    .maybeSingle();

  if (blocked) {
    return NextResponse.json({ allowed: false, reason: "Account creation is currently unavailable. Please contact support." });
  }

  return NextResponse.json({ allowed: true, remaining });
}
