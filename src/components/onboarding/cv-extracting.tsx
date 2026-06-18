"use client";

export function CvExtracting() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-lg font-medium text-white">Reading your CV...</p>
        <p className="mt-1 text-sm text-white/60">
          AI is extracting your skills and experience
        </p>
      </div>
    </div>
  );
}
