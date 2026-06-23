"use client";

interface SearchProgressProps {
  completedLines: string[];
  activeLine: string;
  progress: number;
}

const ellipsisKeyframes = `
@keyframes ellipsis {
  0%   { content: "." }
  33%  { content: ".." }
  66%  { content: "..." }
}
`;

export function SearchProgress({ completedLines, activeLine, progress }: SearchProgressProps) {
  return (
    <div className="space-y-2">
      <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <div className="space-y-1 text-xs">
        <style>{ellipsisKeyframes}</style>
        {completedLines.map((line, i) => (
          <p key={i} className="text-[var(--color-text-secondary)]">
            <span className="text-green-400 mr-1">&#10003;</span>
            {line}
          </p>
        ))}
        {activeLine && (
          <p className="text-[var(--color-text-primary)] flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            {activeLine}
            <span className="inline-block animate-pulse">...</span>
          </p>
        )}
      </div>
    </div>
  );
}
