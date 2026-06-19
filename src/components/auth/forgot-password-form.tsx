"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ForgotPasswordFormProps {
  onBack: () => void;
  onSent: (email: string) => void;
}

export function ForgotPasswordForm({ onBack, onSent }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      onSent(email);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-text-secondary)] text-center">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          placeholder="you@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
      >
        Back to Log In
      </button>
    </form>
  );
}
