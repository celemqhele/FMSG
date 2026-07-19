"use client";

import { useEffect } from "react";

const GA_ID = "G-4QMEHZSCXF";

function loadGA() {
  if (document.getElementById("ga-script")) return;

  const script = document.createElement("script");
  script.id = "ga-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  const w = window as unknown as { dataLayer: unknown[][] };
  w.dataLayer = w.dataLayer || [];
  function gtag(...args: unknown[]) {
    w.dataLayer.push(args);
  }
  gtag("js", new Date());
  gtag("config", GA_ID);
}

export function GoogleAnalytics() {
  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (consent === "true") loadGA();

    const onConsent = (e: Event) => {
      if ((e as CustomEvent).detail?.consent === "true") loadGA();
    };
    window.addEventListener("cookie-consent-changed", onConsent);
    return () => window.removeEventListener("cookie-consent-changed", onConsent);
  }, []);

  return null;
}
