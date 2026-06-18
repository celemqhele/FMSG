"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (event !== "SIGNED_IN" || !session) return;
      if (pathname.startsWith("/auth/")) return;
      document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single();

        if (profile?.onboarding_completed) {
          router.push("/dashboard");
          return;
        }
      } catch {
        // profiles table may not exist yet — first login
      }

      router.push("/dashboard");
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  return null;
}
