"use client";

import { useState, useEffect } from "react";
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

    // Skip redirect if user just logged in via modal — prevents double redirect
    if (sessionStorage.getItem("just_logged_in")) {
      sessionStorage.removeItem("just_logged_in");
      setGuardState("idle");
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
    return <LoginTransition type="login" onComplete={() => setGuardState("idle")} />;
  }

  return null;
}
