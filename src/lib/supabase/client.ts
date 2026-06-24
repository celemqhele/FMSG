import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

function clearStaleAuthCookies() {
  if (typeof document === "undefined") return;
  const prefixes = ["fmsg-auth"];
  document.cookie.split(";").forEach((c) => {
    const name = c.trim().split("=")[0];
    if (prefixes.some((p) => name === p || name.startsWith(p + "."))) {
      document.cookie = `${name}=; max-age=0; path=/;`;
    }
  });
}

export function createClient() {
  if (!client) {
    // Clear stale session cookies before initializing the client.
    // Prevents background auto-refresh of an expired session from
    // firing `signOut` and destroying a fresh login session.
    clearStaleAuthCookies();

    const keepSignedIn = typeof window !== "undefined"
      ? localStorage.getItem("keep_signed_in") !== "false"
      : true;

    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          storageKey: "fmsg-auth",
        },
        cookieOptions: {
          ...(keepSignedIn ? { maxAge: 604800 } : {}),
        },
      }
    );
  }
  return client;
}

export function resetClient() {
  client = null;
}
