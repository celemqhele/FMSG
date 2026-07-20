"use client";

import { useEffect } from "react";

const GA_ID = "G-4QMEHZSCXF";

function loadGA() {
  if (document.getElementById("ga-script")) {
    console.log("[GA4] Script already loaded, skipping");
    return;
  }

  console.log("[GA4] Loading gtag.js for", GA_ID);

  const script = document.createElement("script");
  script.id = "ga-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

  script.onload = () => console.log("[GA4] gtag.js loaded successfully");
  script.onerror = (e) => console.error("[GA4] Failed to load gtag.js:", e);

  document.head.appendChild(script);

  const w = window as unknown as { dataLayer: unknown[][] };
  w.dataLayer = w.dataLayer || [];
  function gtag(...args: unknown[]) {
    console.log("[GA4] gtag push:", JSON.stringify(args));
    w.dataLayer.push(args);
  }
  gtag("js", new Date());
  gtag("config", GA_ID);

  console.log("[GA4] Config sent, waiting for network hit");
}

export function GoogleAnalytics() {
  useEffect(() => {
    console.log("[GA4] Component mounted, consent:", localStorage.getItem("cookie_consent"));
    loadGA();
  }, []);

  return null;
}
