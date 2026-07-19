"use client";

import { useState, useCallback } from "react";

interface MobileVerdictSheetProps {
  isOpen: boolean;
  onClose: () => void;
  matchScore: number;
  scoreLabel: string;
  scoreBg: string;
  matchSummary: string;
  recruiterVerdict?: string | null;
  knockoutFail?: boolean | null;
  dynamicRequirements?: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  pillarScores?: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxesApplied?: string[] | null;
  suggestedCvName?: string;
}

const PILLAR_LABELS: Record<string, string> = {
  industry: "Industry",
  function: "Function",
  scale: "Experience",
  tools: "Tools",
  location: "Location",
};
const PILLAR_ORDER = ["industry", "function", "scale", "tools", "location"];

export function MobileVerdictSheet({
  isOpen,
  onClose,
  matchScore,
  scoreLabel,
  scoreBg,
  matchSummary,
  recruiterVerdict,
  knockoutFail,
  dynamicRequirements,
  pillarScores,
  taxesApplied,
  suggestedCvName,
}: MobileVerdictSheetProps) {
  const [dragY, setDragY] = useState(0);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onClose();
    else setDragY(0);
  }, [dragY, onClose]);

  if (!isOpen) return null;

  const grouped: Record<string, typeof dynamicRequirements> = {};
  if (dynamicRequirements) {
    for (const req of dynamicRequirements) {
      const p = req.pillar || "other";
      if (!grouped[p]) grouped[p] = [];
      grouped[p]!.push(req);
    }
  }
  const orderedPillars = PILLAR_ORDER.filter((p) => grouped[p]);
  const extraPillars = Object.keys(grouped).filter((p) => !PILLAR_ORDER.includes(p));

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] transition-transform duration-300 ease-out overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - 2.5rem)",
          transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 sticky top-0 bg-[#1C1C1E] z-10">
          <div className="w-9 h-[5px] rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-5">
          {/* Header badges */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${scoreBg}`}>
              {scoreLabel} {matchScore}%
            </span>
            {recruiterVerdict && (
              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                recruiterVerdict === "HIRE" ? "bg-green-500/20 text-green-400" :
                recruiterVerdict === "INTERVIEW" ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400"
              }`}>
                {recruiterVerdict}
              </span>
            )}
          </div>

          {/* Summary */}
          {matchSummary && (
            <p className="text-[11px] text-white/70 leading-relaxed mb-3 whitespace-pre-line">{matchSummary}</p>
          )}

          {/* Knockout */}
          {knockoutFail && (
            <div className="px-2.5 py-1.5 rounded-[7px] bg-red-500/10 border border-red-500/20 mb-3">
              <p className="text-[10px] text-red-400 font-medium">Knockout triggered, mandatory requirement not met.</p>
            </div>
          )}

          {/* Requirements */}
          {dynamicRequirements && dynamicRequirements.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-1.5">Requirements Checklist</p>
              <div className="space-y-2">
                {[...orderedPillars, ...extraPillars].map((pillar) => {
                  const reqs = grouped[pillar]!;
                  const met = reqs.filter((r) => r.met).length;
                  const total = reqs.length;
                  const score = pillarScores?.[pillar as keyof typeof pillarScores];
                  return (
                    <div key={pillar} className="rounded-[7px] bg-white/[0.03] border border-white/[0.06] p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-white">{PILLAR_LABELS[pillar] || pillar}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-white/50">{met}/{total} met</span>
                          {score != null && (
                            <div className="w-11 h-1 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${score >= 70 ? "bg-green-400" : score >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${Math.min(score, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {reqs.map((r, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className={`mt-0.5 shrink-0 text-[10px] ${r.met ? "text-green-400" : "text-red-400"}`}>
                              {r.met ? "\u2713" : "\u2717"}
                            </span>
                            <div className="min-w-0">
                              <span className={`text-[11px] ${r.met ? "text-white/90" : "text-white/60"}`}>
                                {r.requirement}
                                {r.mandatory && !r.met && (
                                  <span className="ml-1.5 text-[9px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">required</span>
                                )}
                              </span>
                              {r.evidence && (
                                <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{r.evidence}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Taxes */}
          {taxesApplied && taxesApplied.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-1">Deductions</p>
              <div className="flex flex-wrap gap-1">
                {taxesApplied.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggested CV */}
          {suggestedCvName && (
            <div className="pt-2.5 border-t border-white/[0.06] mb-3">
              <p className="text-[10px] text-white/50">
                Suggested CV: <span className="text-white font-medium">{suggestedCvName}</span>
              </p>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-[10px] bg-[var(--color-accent)] text-white text-[11px] font-medium active:scale-[0.98] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
