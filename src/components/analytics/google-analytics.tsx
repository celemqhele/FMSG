"use client";

import { useEffect } from "react";

const GA_ID = "G-4QMEHZSCXF";

async function logToServer(message: string, data?: unknown) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, data, timestamp: new Date().toISOString() }),
    });
  } catch (e) {
    console.error("[GA4] Failed to send log to server:", e);
  }
}

function loadGA() {
  if (document.getElementById("ga-script")) {
    logToServer("[GA4] Script already loaded, skipping");
    return;
  }

  logToServer(`[GA4] Loading gtag.js for ${GA_ID}`);

  const script = document.createElement("script");
  script.id = "ga-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

  script.onload = () => logToServer("[GA4] gtag.js loaded successfully");
  script.onerror = (e) => logToServer("[GA4] Failed to load gtag.js", e);

  document.head.appendChild(script);

  const w = window as unknown as { dataLayer: unknown[][] };
  w.dataLayer = w.dataLayer || [];
  function gtag(...args: unknown[]) {
    logToServer("[GA4] gtag push", args);
    w.dataLayer.push(args);
  }
  gtag("js", new Date());
  gtag("config", GA_ID);

  logToServer("[GA4] Config sent, waiting for network hit");
}

export function GoogleAnalytics() {
  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    logToServer("[GA4] Component mounted", { consent });

    if (consent === "true") {
      loadGA();
      return;
    }

    function onConsentChanged(e: Event) {
      const detail = (e as CustomEvent<{ consent: string }>).detail;
      if (detail.consent === "true") {
        logToServer("[GA4] Consent granted, loading GA4");
        loadGA();
      }
    }

    window.addEventListener("cookie-consent-changed", onConsentChanged);
    return () => window.removeEventListener("cookie-consent-changed", onConsentChanged);
  }, []);

  return null;
}
