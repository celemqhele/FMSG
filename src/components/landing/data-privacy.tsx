import { LiquidGlassCard } from "./liquid-glass-card";

export function DataPrivacy() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="max-w-3xl mx-auto">
        <LiquidGlassCard className="text-center p-8 md:p-12">
          <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
            Your data is yours
          </h2>
          <p className="mt-6 text-base md:text-lg text-white/70 leading-relaxed">
            We store your CV and profile information only to match you to relevant
            jobs. Your data is encrypted in transit and at rest via Supabase, and
            we never share or sell your information to third parties.
          </p>
          <p className="mt-4 text-base md:text-lg text-white/70 leading-relaxed">
            FMSG operates in full compliance with POPIA (South Africa&#39;s
            Protection of Personal Information Act). You can request deletion of
            all your data at any time from your profile settings.
          </p>
          <a
            href="/privacy"
            className="inline-block mt-6 text-sm font-medium text-white hover:underline transition-colors"
          >
            Read our Privacy Policy
          </a>
        </LiquidGlassCard>
      </div>
    </section>
  );
}
