"use client";

import { useEffect } from "react";

const GA_ID = "G-4QMEHZSCXF";

function gtag(...args: unknown[]) {
  const w = window as unknown as { dataLayer: unknown[][] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(args);
}

function initGA() {
  gtag("js", new Date());
  gtag("config", GA_ID);
}

export function GoogleAnalytics() {
  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");

    if (consent === "true") {
      initGA();
      return;
    }

    function onConsentChanged(e: Event) {
      const detail = (e as CustomEvent<{ consent: string }>).detail;
      if (detail.consent === "true") {
        initGA();
      }
    }

    window.addEventListener("cookie-consent-changed", onConsentChanged);
    return () => window.removeEventListener("cookie-consent-changed", onConsentChanged);
  }, []);

  return null;
}
