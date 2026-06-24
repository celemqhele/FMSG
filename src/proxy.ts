import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Skip RSC fetch requests — cookies may not be included in fetch() requests
  if (request.nextUrl.searchParams.has("_rsc")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storageKey: "fmsg-auth",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const rawCookieHeader = request.headers.get("cookie") ?? "";
  const { data: { session } } = await supabase.auth.getSession();

  // Protected routes — redirect to landing if not authenticated
  const protectedPaths = ["/dashboard", "/settings", "/profile", "/onboarding", "/upgrade"];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (isProtected && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    // Surface what the proxy saw so you can debug in the address bar
    url.searchParams.set("dbg", session ? "ok" : rawCookieHeader ? `cookies-present-but-no-session` : "no-cookies-at-all");
    return NextResponse.redirect(url);
  }

  // Expose what the proxy sees via response header so you can check in DevTools
  supabaseResponse.headers.set("X-Proxy-Debug", `cookies:${rawCookieHeader.length}chars|session:${session ? "yes" : "no"}`);
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|dashboard|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
