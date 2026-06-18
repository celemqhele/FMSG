"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface VerifyCodeProps {
  email: string;
  password?: string;
  name?: string;
  surname?: string;
  onBack: () => void;
  onVerified: () => void;
}

export function VerifyCode({ email, password, name, surname, onBack, onVerified }: VerifyCodeProps) {
  const [codes, setCodes] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const verifyToken = async (token: string) => {
    setError("");
    setLoading(true);
    const supabase = createClient();

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (verifyErr) {
      setLoading(false);
      setError(verifyErr.message);
      setCodes(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      return;
    }

    if (password) {
      const fullName = [name, surname].filter(Boolean).join(" ");
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
        data: fullName ? { full_name: fullName } : undefined,
      });
      if (updateErr) {
        setLoading(false);
        setError(updateErr.message);
        return;
      }
    }

    setLoading(false);
    onVerified();
  };

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const next = [...codes];
    next[index] = value;
    setCodes(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (value && index === 5) {
      const token = [...next.slice(0, 5), value].join("");
      verifyToken(token);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = codes.join("");
    if (token.length === 6) verifyToken(token);
  };

  const handleResend = async () => {
    setError("");
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({ email });
    setLoading(false);
  };

  const allFilled = codes.every((c) => c !== "");

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          We sent a 6-digit code to
        </p>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{email}</p>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

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
              className="w-10 h-12 text-center text-lg font-semibold rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
              disabled={loading}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || !allFilled}
          className="w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify Email"}
        </button>
      </form>

      <div className="flex items-center gap-4 text-sm">
        <button
          onClick={handleResend}
          disabled={loading}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50"
        >
          Resend code
        </button>
        <span className="text-[var(--color-border)]">|</span>
        <button
          onClick={onBack}
          disabled={loading}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50"
        >
          Back to sign up
        </button>
      </div>
    </div>
  );
}
