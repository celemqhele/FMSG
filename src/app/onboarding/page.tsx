"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CvUpload } from "@/components/onboarding/cv-upload";
import { CvExtracting } from "@/components/onboarding/cv-extracting";
import { ProfileReview } from "@/components/onboarding/profile-review";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { createClient } from "@/lib/supabase/client";

type Step = "upload" | "extracting" | "review";

interface ExtractedProfile {
  skills: string[];
  experience: { company: string; role: string; start_date: string; end_date: string; description: string }[];
  education: { institution: string; degree: string; year: number }[];
  years_of_experience: number;
  current_role: string;
  location: string;
  cv_text: string;
}

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("upload");
  const [profile, setProfile] = useState<ExtractedProfile | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/");
      }
    });
  }, [router]);

  const handleFileSelected = async (file: File) => {
    setStep("extracting");
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/extract-cv", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.code ? `${data.code}: ${data.error}` : data.error || "Extraction failed.");
        setStep("upload");
        return;
      }

      setProfile(data);
      setStep("review");
    } catch {
      setError("Network error. Please try again.");
      setStep("upload");
    }
  };

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <PageTransitionWrapper>
        <main className="flex-1 flex items-center justify-center px-6 py-24 md:py-32">
          <div className="w-full max-w-2xl">
            {error && (
              <p className="mb-6 text-sm text-red-400 text-center">{error}</p>
            )}
            {step === "upload" && <CvUpload onFileSelected={handleFileSelected} />}
            {step === "extracting" && <CvExtracting />}
            {step === "review" && profile && <ProfileReview data={profile} />}
          </div>
        </main>
      </PageTransitionWrapper>
    </>
  );
}
