import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TransitionProvider } from "@/components/providers/transition-provider";
import { ErrorPopupProvider } from "@/components/providers/error-popup-provider";
import { TransitionOverlay } from "@/components/ui/transition-overlay";
import { CookieConsentBanner } from "@/components/ui/cookie-consent-banner";
import { AuthHandler } from "@/components/auth/auth-handler";
import { AutoLoginGuard } from "@/components/auth/auto-login-guard";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Find Me Some Jobs",
  description:
    "Find jobs that match your skills. Upload your CV, search live jobs, and get matched with opportunities.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Find Me Some Jobs",
    description:
      "Find jobs that match your skills. Upload your CV, search live jobs, and get matched with opportunities.",
    siteName: "Find Me Some Jobs",
    type: "website",
    locale: "en_ZA",
  },
  other: {
    "theme-color": "#0a0a0a",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script src="/theme-init.js" />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-4QMEHZSCXF"
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-dvh flex flex-col" data-build-id="jun27-v2">
        <ThemeProvider>
          <TransitionProvider>
            <ErrorPopupProvider>
              {children}
              <TransitionOverlay />
              <AutoLoginGuard />
              <AuthHandler />
              <CookieConsentBanner />
              <GoogleAnalytics />
            </ErrorPopupProvider>
          </TransitionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
