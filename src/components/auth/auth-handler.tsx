"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session) return;
      if (pathname.startsWith("/auth/")) return;
      document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;
      router.push("/auth/confirm");
    });
  }, [router, pathname]);

  return null;
}
