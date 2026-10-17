import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateLocationLadder } from "@/lib/location-ladders";

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
    const location = body?.location?.trim();
    if (!location) {
      return NextResponse.json({ error: "location is required." }, { status: 400 });
    }

    const steps = await generateLocationLadder(location);

    return NextResponse.json({
      steps: [
        { step: 1, value: steps.step_1 },
        { step: 2, value: steps.step_2 },
        { step: 3, value: steps.step_3 },
        { step: 4, value: steps.step_4 },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
