"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";

interface CvUploadProps {
  onFileSelected: (file: File) => void;
}

export function CvUpload({ onFileSelected }: CvUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const allowed = ["application/pdf", "text/plain"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".txt")) {
      return;
    }
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
          Upload your CV
        </h1>
        <p className="mt-3 text-white/60">
          We'll scan your CV and build your profile automatically.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-md p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
          dragOver
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-white/20 hover:border-white/40 bg-white/5"
        }`}
      >
        <Upload size={36} className="mx-auto text-white/40" />
        <p className="mt-4 text-sm text-white/60">
          Drag and drop your CV here, or click to browse
        </p>
        <p className="mt-1 text-xs text-white/40">PDF or TXT (max 10MB)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="hidden"
        />
      </div>
    </div>
  );
}
