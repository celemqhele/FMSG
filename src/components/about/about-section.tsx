"use client";

import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { Target, Zap, Shield, Users } from "lucide-react";

const values = [
  {
    icon: Target,
    title: "Our Mission",
    description:
      "We believe finding a job should be about your skills, not your ability to game an application system. FMSG uses AI to match you with opportunities that actually fit.",
  },
  {
    icon: Zap,
    title: "How It Works",
    description:
      "Upload your CV once. Our AI extracts your skills and experience, then continuously matches you against live job listings. No manual searching, no repetitive form filling.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description:
      "Your data stays yours. We never share your CV with employers without your explicit consent. You control who sees what, and you can delete everything at any time.",
  },
  {
    icon: Users,
    title: "Who It's For",
    description:
      "Job seekers who want to stop scrolling and start matching. From fresh graduates to seasoned professionals, if you have skills, FMSG finds where they belong.",
  },
];

export function AboutSection() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-semibold text-white tracking-tight">
          About FMSG
        </h1>
        <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
          Find Me Some Jobs is an AI-powered job matching platform. Upload your CV, and
          we find the roles that fit, no wasted applications, no spam.
        </p>
      </div>

      <div className="mt-20 max-w-5xl mx-auto grid gap-6 md:grid-cols-2">
        {values.map((item) => (
          <LiquidGlassCard key={item.title} variant="surface" className="p-8">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white shrink-0">
                <item.icon size={22} />
              </div>
              <h2 className="text-xl font-semibold text-white">{item.title}</h2>
            </div>
            <p className="mt-4 text-white/80 leading-relaxed">{item.description}</p>
          </LiquidGlassCard>
        ))}
      </div>
    </section>
  );
}
