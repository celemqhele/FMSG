import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[CLIENT-LOG]", JSON.stringify(body));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SERVER-ERROR] Failed to log client message:", error);
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
