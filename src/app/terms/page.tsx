"use client";

import { useState, useEffect, useCallback } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/auth/auth-modal").then((mod) => mod.AuthModal), { ssr: false });
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { Scale } from "lucide-react";

const sections = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By creating an account or using Find Me Some Jobs ('FMSG', 'we', 'us', 'our'), you agree to be bound by these Terms of Service ('Terms'). If you do not agree, do not use the Service. We may update these Terms from time to time; continued use after changes constitutes acceptance.",
  },
  {
    title: "2. Description of Service",
    content:
      "FMSG provides an AI-powered job matching platform. The Service includes: CV parsing and analysis, job search aggregation via third-party search engines, AI-generated job matching scores, tailored CV generation, and Persistent Finder multi-round job discovery. All job matches and scores are AI-generated suggestions and do not constitute a guarantee of employment.",
  },
  {
    title: "3. Eligibility",
    content:
      "You must be at least 18 years old to use the Service. By registering, you confirm that you are 18 or older. If you are under 18, you may not use the Service. You must have the legal capacity to enter into binding agreements.",
  },
  {
    title: "4. Account Registration and Security",
    content:
      "You are responsible for maintaining the confidentiality of your login credentials and for all activities under your account. You must provide accurate, current, and complete information. Notify us immediately of any unauthorized use at support@findmesomejobs.co.za.",
  },
  {
    title: "5. Prohibited Conduct",
    content:
      "You may not use the Service for any unlawful purpose or in violation of these Terms. Prohibited conduct includes, but is not limited to: (a) automated scraping, crawling, or data extraction of any kind; (b) using bots, scripts, or automated tools to interact with the Service; (c) creating multiple accounts to circumvent usage limits or rate limits; (d) reselling, sublicensing, or commercially exploiting job matches, CVs, or any Service output; (e) uploading malicious files, viruses, or content that may harm the Service or other users; (f) attempting to manipulate or game AI match scores; (g) interfering with the proper functioning of the Service, including bypassing rate limits or security measures; (h) using the Service for unauthorized commercial purposes; (i) violating any applicable laws or regulations, including South Africa's Protection of Personal Information Act (POPIA).",
  },
  {
    title: "6. AI Disclaimer",
    content:
      "Job matches, scores, CV tailoring, and all AI-generated content are provided 'as is' for informational purposes only. They do not constitute professional career advice, employment guarantees, or endorsements. AI outputs may contain errors, omissions, or inaccuracies. You should independently verify any critical information before acting on it.",
  },
  {
    title: "7. Payments and Refunds",
    content:
      "Paid plans and Persistent Finder credits are billed in advance via Paystack. All payments are final and non-refundable, except as required by applicable consumer protection law. By subscribing, you authorize recurring charges at the then-current rate until you cancel. Cancellation takes effect at the end of the current billing period. Paystack processes all payments; we do not store card details.",
  },
  {
    title: "8. Cancellation and Termination",
    content:
      "You may cancel your subscription at any time from your account settings. Upon cancellation, you retain access until the end of the paid billing period. We may suspend or terminate your account, without refund, if we reasonably believe you have violated these Terms or engaged in prohibited conduct. You may delete your account at any time, which permanently removes all associated data.",
  },
  {
    title: "9. Limitation of Liability",
    content:
      "To the maximum extent permitted by South African law, FMSG shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to loss of employment opportunities, lost profits, or data loss. Our total liability for any claim shall not exceed the amount you have paid us in the twelve (12) months preceding the claim.",
  },
  {
    title: "10. Disclaimer of Warranties",
    content:
      "The Service is provided 'as is' and 'as available' without warranties of any kind, either express or implied. We do not guarantee that the Service will be uninterrupted, error-free, secure, or that job matches will result in employment. We rely on third-party services (AI providers, job search engines, payment processors) and are not responsible for their failures.",
  },
  {
    title: "11. Data Protection and Privacy",
    content:
      "Your use of the Service is governed by our Privacy Policy, which explains how we collect, process, and store your personal data. By using the Service, you consent to the processing of your data as described in the Privacy Policy, including transfer to third-party AI services for CV analysis. We comply with the Protection of Personal Information Act (POPIA).",
  },
  {
    title: "12. Intellectual Property",
    content:
      "The Service, including its software, branding, and content, is owned by FMSG and is protected by intellectual property laws. You retain ownership of your CV and profile data. You grant us a limited license to process your data for the purpose of providing the Service. You may not copy, modify, distribute, or reverse-engineer any part of the Service.",
  },
  {
    title: "13. Third-Party Services",
    content:
      "The Service integrates with third-party providers including Google Gemini AI, Groq, OpenRouter, SerpAPI, Jina AI, Paystack, and Supabase. We are not responsible for the acts or omissions of these third parties. Your interactions with them are governed by their respective terms and policies.",
  },
  {
    title: "14. Governing Law and Disputes",
    content:
      "These Terms are governed by the laws of the Republic of South Africa. Any disputes arising from these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved, disputes shall be submitted to mediation in South Africa. If mediation fails, either party may seek relief in the courts of South Africa.",
  },
  {
    title: "15. Contact",
    content:
      "For questions about these Terms, please contact us at support@findmesomejobs.co.za. For legal correspondence, address: Find Me Some Jobs, South Africa.",
  },
];

export default function TermsPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { startTransition, endTransition } = useTransition();

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
            <Scale size={40} className="mx-auto text-white/40" />
            <h1 className="mt-6 text-4xl md:text-5xl font-semibold text-white tracking-tight">
              Terms of Service
            </h1>
            <p className="mt-4 text-lg text-white/60">
              Last updated June 2026.
            </p>
          </div>
          <div className="mt-12 max-w-3xl mx-auto space-y-6">
            {sections.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl p-6 bg-white/[0.03] border border-white/[0.06]"
              >
                <h2 className="text-lg font-semibold text-white mb-3">{s.title}</h2>
                <p className="text-sm text-white/60 leading-relaxed">{s.content}</p>
              </div>
            ))}
          </div>
        </main>
      </PageTransitionWrapper>
      <Footer />
      <AuthModal
        isOpen={authOpen}
        onClose={handleClose}
        defaultTab={authTab}
      />
    </>
  );
}
