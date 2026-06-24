import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' https://js.paystack.co",
              "style-src 'self' 'unsafe-inline' https://paystack.com",
              "connect-src 'self' https://nnebtygloqixibbjxsjr.supabase.co https://api.paystack.co https://generativelanguage.googleapis.com https://api.groq.com https://openrouter.ai https://api.openai.com https://serpapi.com https://r.jina.ai https://www.google.com",
              "frame-src https://js.paystack.co https://checkout.paystack.com",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
