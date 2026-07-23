"use client";

import { useState, useEffect, useCallback } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { MobileAuthSheet } from "@/components/auth/mobile-auth-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { FileText } from "lucide-react";

const sections = [
  {
    title: "1. Information We Collect",
    content:
      "We collect personal information you provide directly: your name, surname, email address, phone number, CV file, job preferences, and salary expectations. We also collect usage data such as search queries, saved jobs, and tailored CV generations.",
  },
  {
    title: "2. How We Use Your Information",
    content:
      "Your information is used to provide job matching services: parsing your CV to extract skills, searching for matching jobs via third-party search engines, generating tailored CVs using AI, and managing your account and subscription.",
  },
  {
    title: "3. Third-Party Services",
    content:
      "We use the following third-party services: Google Gemini AI (CV parsing and tailoring), Groq and OpenRouter (AI inference providers), SerpAPI (Google Jobs search), Jina AI (job description reader), Paystack (payment processing), Supabase (database and storage), and Mailtrap (transactional email delivery). Each service processes data according to its own privacy policy and data processing agreements.",
  },
  {
    title: "4. Data Storage and Security",
    content:
      "Your data is stored on Supabase servers, which may be located outside South Africa. We implement industry-standard security measures including encryption in transit (TLS) and at rest, row-level security, and access controls. CV files are stored in encrypted private storage buckets. Your CV and personal data are never shared with other users or made publicly accessible. Where your data is transferred outside South Africa, we ensure the recipient is subject to law, binding corporate rules, or a contract that provides an adequate level of protection as required by POPIA section 72.",
  },
  {
    title: "5. Data Retention",
    content:
      "We retain your data for as long as your account is active. If you delete your account, all associated data including your CV, search history, saved jobs, and profile information are permanently deleted from our systems within 30 days.",
  },
  {
    title: "6. Your Rights (POPIA)",
    content:
      "As a South African user, you have rights under the Protection of Personal Information Act (POPIA): the right to access your data, correct inaccurate data, object to processing, request deletion, and data portability. To exercise these rights, contact us at the email below. You also have the right to lodge a complaint with the Information Regulator if you believe your personal information has been mishandled. The Information Regulator can be contacted at complaints.IR@justice.gov.za or +27 (0)10 023 5200.",
  },
  {
    title: "7. Cookies",
    content:
      "We use essential cookies for authentication and session management, and localStorage to persist your theme preference and login state. With your consent, we also use Google Analytics (GA4) to collect anonymised usage data such as pages visited and session duration. GA4 sets the following cookies: _ga (expires after 2 years, distinguishes unique users) and _ga_* (expires after 2 years, persists session state). You can manage your cookie preferences at any time via the Cookie Settings link in the footer.",
  },
  {
    title: "8. Information Officer",
    content:
      "Our designated Information Officer, responsible for ensuring POPIA compliance and handling data subject requests, can be contacted at support@findmesomejobs.co.za.",
  },
  {
    title: "9. Changes to This Policy",
    content:
      "We may update this privacy policy from time to time. Material changes will be notified via email or through the platform. Continued use after changes constitutes acceptance of the updated policy.",
  },
  {
    title: "10. Contact",
    content:
      "For privacy-related inquiries or to exercise your POPIA rights, please contact us at support@findmesomejobs.co.za.",
  },
];

export default function PrivacyPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { startTransition, endTransition } = useTransition();
  const isMobile = useIsMobile();

  useEffect(() => {
    endTransition();
  }, [endTransition]);

  useEffect(() => {
    if (authOpen) {
      startTransition();
      const timer = setTimeout(endTransition, 800);
      return () => clearTimeout(timer);
    }
  }, [authOpen, startTransition, endTransition]);

  const openAuth = (tab: "login" | "signup") => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  const handleClose = useCallback(() => setAuthOpen(false), []);

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar
        onLoginClick={() => openAuth("login")}
        onSignUpClick={() => openAuth("signup")}
      />
      <PageTransitionWrapper>
        <main className="flex-1 px-6 py-24 md:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <FileText size={40} className="mx-auto text-white/60" />
            <h1 className="mt-6 text-4xl md:text-5xl font-semibold text-white tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-4 text-lg text-white/80">
              How we handle your data. Last updated 23 July 2026.
            </p>
          </div>

          <div className="mt-12 max-w-3xl mx-auto space-y-6">
            {sections.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl p-6 bg-white/[0.03] border border-white/[0.06]"
              >
                <h2 className="text-lg font-semibold text-white mb-3">{s.title}</h2>
                <p className="text-sm text-white/80 leading-relaxed">{s.content}</p>
              </div>
            ))}
          </div>
        </main>
      </PageTransitionWrapper>
      <Footer />
      {isMobile ? (
        <MobileAuthSheet
          isOpen={authOpen}
          onClose={handleClose}
          defaultTab={authTab}
        />
      ) : (
        <AuthModal
          isOpen={authOpen}
          onClose={handleClose}
          defaultTab={authTab}
        />
      )}
    </>
  );
}
