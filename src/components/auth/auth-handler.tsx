"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    const handleSession = async (session: import("@supabase/supabase-js").Session | null) => {
      if (!session) return;
      document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;

      if (pathname.startsWith("/auth/")) return;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single();

        if (!profile || !profile.onboarding_completed) {
          router.push("/onboarding");
        }
      } catch {
        // profiles table may not exist yet — redirect anyway
        router.push("/onboarding");
      }
    };

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        handleSession(session);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session);
    });
  }, [router, pathname]);

  return null;
}
