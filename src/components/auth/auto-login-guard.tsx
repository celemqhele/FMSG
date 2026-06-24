"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoginTransition } from "@/components/ui/login-transition";

export function AutoLoginGuard() {
  const pathname = usePathname();

  const [guardState, setGuardState] = useState<"loading" | "transition" | "idle">(() => {
    if (
      typeof window !== "undefined" &&
      localStorage.getItem("logged_in") === "true"
    ) {
      return "loading";
    }
    return "idle";
  });

  const handleAutoLoginComplete = useCallback(() => {
    setGuardState("idle");
    window.location.href = "/dashboard";
  }, []);

  useEffect(() => {
    if (guardState !== "loading") return;

    document.documentElement.classList.remove("auth-loading");

    if (
      pathname.startsWith("/auth/") ||
      pathname === "/dashboard" ||
      pathname === "/onboarding"
    ) {
      setGuardState("idle");
      return;
    }

    const justLoggedIn = sessionStorage.getItem("just_logged_in");
    if (justLoggedIn) {
      sessionStorage.removeItem("just_logged_in");
      setGuardState("transition");
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (session) {
        setGuardState("transition");
      } else {
        localStorage.removeItem("logged_in");
        setGuardState("idle");
      }
    });
  }, [guardState, pathname]);

  if (guardState === "loading") {
    return null;
  }

  if (guardState === "transition") {
    return <LoginTransition type="login" onComplete={handleAutoLoginComplete} />;
  }

  return null;
}
