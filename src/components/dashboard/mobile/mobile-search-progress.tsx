"use client";

interface MobileSearchProgressProps {
  completedLines: string[];
  activeLine: string;
  progress: number;
}

export function MobileSearchProgress({ completedLines, activeLine, progress }: MobileSearchProgressProps) {
  return (
    <div className="py-5 px-3 space-y-3">
      <div className="w-full max-w-[220px] mx-auto space-y-3">
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>

        {/* Status lines */}
        <div className="space-y-1 text-[10px]">
          {completedLines.map((line, i) => (
            <p key={i} className="text-white/50 flex items-center gap-1">
              <span className="text-green-400">&#10003;</span>
              <span className="truncate">{line}</span>
            </p>
          ))}
          {activeLine && (
            <p className="text-white flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse shrink-0" />
              <span className="truncate">{activeLine}</span>
              <span className="inline-block animate-pulse">...</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
