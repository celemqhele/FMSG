"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, Check, X, FileText } from "lucide-react";

interface GuestCVModalProps {
  isOpen: boolean;
  onComplete: (profile: { job_titles: string[]; location: string; industry: string }) => void;
  onSkip: () => void;
}

export function GuestCVModal({ isOpen, onComplete, onSkip }: GuestCVModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsed, setParsed] = useState<{ job_titles: string[]; location: string; industry: string } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith(".pdf") && !f.name.endsWith(".txt")) {
      setError("Please upload a PDF or TXT file.");
      return;
    }
    setError("");
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/cv/parse-guest", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to parse CV.");
        setUploading(false);
        return;
      }

      if (!data.job_titles || data.job_titles.length === 0) {
        setError("Could not extract job titles from your CV. Try a different file or skip for now.");
        setUploading(false);
        return;
      }

      setParsed(data);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setUploading(false);
  };

  const handleContinue = () => {
    if (parsed) {
      onComplete(parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onSkip} />
      <div className="relative liquid-glass rounded-2xl p-6 max-w-md mx-4 space-y-6 shadow-2xl">
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 p-1.5 text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
            <Upload size={20} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Upload your CV</h3>
            <p className="text-xs text-white/60">AI extracts job titles, location, and industry for better matches</p>
          </div>
        </div>

        {!parsed ? (
          <>
            {!uploading ? (
              <div
                className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-[var(--color-accent)]/50 transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0] ?? null); }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText size={20} className="text-white/60" />
                    <span className="text-sm text-white/80">{file.name}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload size={28} className="text-white/40 mx-auto" />
                    <p className="text-sm text-white/60">Drag your CV here or click to browse</p>
                    <p className="text-xs text-white/40">PDF or TXT files only</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
                <p className="text-sm text-white/60">AI is analysing your CV...</p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <div className="flex gap-3 justify-between">
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                Skip for now
              </button>
              {file && !uploading && (
                <button
                  onClick={handleUpload}
                  className="px-5 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
                >
                  Analyse CV
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-white/50 mb-1">Job titles</p>
                <div className="flex flex-wrap gap-1">
                  {parsed.job_titles.map((t) => (
                    <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {parsed.location && (
                <div>
                  <p className="text-xs text-white/50 mb-1">Location</p>
                  <p className="text-sm text-white/80 flex items-center gap-1.5">
                    <Check size={14} className="text-[var(--color-success)]" />
                    {parsed.location}
                  </p>
                </div>
              )}
              {parsed.industry && (
                <div>
                  <p className="text-xs text-white/50 mb-1">Industry</p>
                  <p className="text-sm text-white/80">{parsed.industry}</p>
                </div>
              )}
            </div>

            <button
              onClick={handleContinue}
              className="w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
