"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === "SIGNED_IN" && session) {
        localStorage.setItem("logged_in", "true");
        sessionStorage.setItem("just_logged_in", "true");
      } else if (event === "SIGNED_OUT") {
        localStorage.removeItem("logged_in");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
