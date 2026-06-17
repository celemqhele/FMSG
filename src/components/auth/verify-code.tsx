"use client";

import { useState, useRef, useEffect } from "react";

interface VerifyCodeProps {
  email: string;
  onBack: () => void;
}

export function VerifyCode({ email, onBack }: VerifyCodeProps) {
  const [codes, setCodes] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const next = [...codes];
    next[index] = value;
    setCodes(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          We sent a 6-digit code to
        </p>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{email}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6 w-full">
        <div className="flex gap-2">
          {codes.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-10 h-12 text-center text-lg font-semibold rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          ))}
        </div>

        <button
          type="submit"
          className="w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
        >
          Verify Email
        </button>
      </form>

      <div className="flex items-center gap-4 text-sm">
        <button className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors">
          Resend code
        </button>
        <span className="text-[var(--color-border)]">|</span>
        <button
          onClick={onBack}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
        >
          Back to sign up
        </button>
      </div>
    </div>
  );
}
