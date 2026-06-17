import { LiquidGlassCard } from "./liquid-glass-card";

const steps = [
  {
    number: "01",
    title: "Build your profile",
    description:
      "Upload your CV or fill in your details. AI reads your experience and preferences so every search is personal.",
  },
  {
    number: "02",
    title: "Search live jobs",
    description:
      "AI searches live job listings, filters out mismatches, and scores each role against your profile.",
  },
  {
    number: "03",
    title: "Get matched and apply",
    description:
      "Review ranked results with match scores. Tailor your CV instantly and apply with confidence.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold text-center text-white tracking-tight">
          How it works
        </h2>
        <div className="mt-16 grid gap-6 md:grid-cols-3 md:gap-6">
          {steps.map((step) => (
            <LiquidGlassCard key={step.number} className="flex flex-col items-center text-center p-8">
              <span className="text-5xl font-bold text-white/20 select-none">
                {step.number}
              </span>
              <h3 className="mt-4 text-xl font-medium text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-base text-white/60 leading-relaxed">
                {step.description}
              </p>
            </LiquidGlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
