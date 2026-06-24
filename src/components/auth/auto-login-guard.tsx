"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export function AutoLoginGuard() {
  const pathname = usePathname();

  const [guardState, setGuardState] = useState<"loading" | "idle">(() => {
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

    if (pathname.startsWith("/auth/") || pathname.startsWith("/dashboard") || pathname === "/onboarding") {
      setGuardState("idle");
      return;
    }

    setGuardState("idle");
  }, [guardState, pathname]);

  if (guardState === "loading") {
    return null;
  }

  return null;
}
