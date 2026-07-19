import { createClient } from "@supabase/supabase-js";

const DEBUG = typeof process !== "undefined" && process.env.DEBUG === "true";

export function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

export function debugError(...args: unknown[]) {
  if (DEBUG) {
    console.error(...args);
  }
}

export function logError(userId: string | null, errorCode: string, message: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    supabase
      .from("error_logs")
      .insert({ user_id: userId, error_code: errorCode, message })
      .then(({ error }) => {
        if (error) console.error("[LOG] Failed to write error_logs:", error.message);
      });
  } catch {
    // never block the caller
  }
}
