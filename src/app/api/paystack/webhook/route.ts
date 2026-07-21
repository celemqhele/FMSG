import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkBodySize } from "@/lib/body-size";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`webhook:${ip}`, "webhook");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const hash = request.headers.get("x-paystack-signature");
  if (!hash) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const sizeError = checkBodySize(request, 1_000_000);
  if (sizeError) return sizeError;

  const body = await request.text();
  const expectedHash = await createHmac(body, PAYSTACK_SECRET_KEY);
  if (hash !== expectedHash) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`[WEBHOOK] Event: ${event.event}`);

  const subData = event.data;
  if (!subData) return NextResponse.json({ ok: true });

  try {
    if (event.event === "charge.success") {
      const reference = subData.reference;
      const authorizationCode = subData.authorization?.authorization_code ?? "";
      const metadata = subData.metadata ?? {};

      if (!reference) return NextResponse.json({ ok: true });

      // Card update flow: user changed their card, update the authorization_code
      if (metadata.purpose === "card_update" && metadata.user_id && authorizationCode) {
        const { data: activeSub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", metadata.user_id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSub) {
          await supabase
            .from("subscriptions")
            .update({
              authorization_code: authorizationCode,
              update_card_credit: subData.amount ?? 100,
            })
            .eq("id", activeSub.id);
          console.log(`[WEBHOOK] Updated authorization_code for user ${metadata.user_id}`);
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK] Error processing event:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function createHmac(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
