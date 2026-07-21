import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!client) {
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
