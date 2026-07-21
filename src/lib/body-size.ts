import { NextRequest, NextResponse } from "next/server";

export function checkBodySize(request: NextRequest, maxSize: number = 1_000_000): NextResponse | null {
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > maxSize) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  return null;
}
