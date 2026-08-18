"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoginTransition } from "@/components/ui/login-transition";

export function AutoLoginGuard() {
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    let settled = false;
    const forceIdle = () => {
      if (!settled) {
        settled = true;
        document.documentElement.classList.remove("auth-loading");
        localStorage.removeItem("logged_in");
        setGuardState("idle");
      }
    };

    timerRef.current = setTimeout(forceIdle, 5000);

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (settled) return;
      settled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (session) {
        setGuardState("transition");
      } else {
        localStorage.removeItem("logged_in");
        setGuardState("idle");
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [guardState, pathname]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const boardSlug = pathname.startsWith("/jobs/") ? pathname.split("/jobs/")[1] : null;

  if (guardState === "loading") {
    return null;
  }

  if (guardState === "transition") {
    return (
      <LoginTransition
        type="login"
        redirectTo={boardSlug ? `/dashboard?board=${boardSlug}` : undefined}
        onComplete={() => setGuardState("idle")}
      />
    );
  }

  return null;
}
