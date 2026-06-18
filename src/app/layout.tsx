import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TransitionProvider } from "@/components/providers/transition-provider";
import { TransitionOverlay } from "@/components/ui/transition-overlay";
import { AuthHandler } from "@/components/auth/auth-handler";
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme")||"system";var d=window.matchMedia("(prefers-color-scheme:dark)").matches;if(t==="dark"||(t==="system"&&d))document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-dvh flex flex-col">
        <ThemeProvider>
          <TransitionProvider>
            {children}
            <TransitionOverlay />
            <AuthHandler />
          </TransitionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
