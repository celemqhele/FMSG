"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface LogInFormProps {
  onForgotPassword: () => void;
  onLoggedIn: () => void;
}

export function LogInForm({ onForgotPassword, onLoggedIn }: LogInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    localStorage.setItem("keep_signed_in", keepSignedIn ? "true" : "false");

    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (err) {
      if (err.message === "Invalid login credentials") {
        setError("Invalid email or password.");
      } else {
        setError(err.message);
      }
    } else if (data?.session) {
      console.log("[LOGIN] Session set:", data.session);
      await supabase.auth.setSession(data.session);
      onLoggedIn();
    } else if (data?.user) {
      setError("Please confirm your email before logging in. Check your inbox for the confirmation link.");
    } else {
      setError("Sign in succeeded but no session was returned. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          placeholder="Enter your password"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={keepSignedIn}
          onChange={(e) => setKeepSignedIn(e.target.checked)}
          className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
        />
        Keep me signed in
      </label>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
        >
          Forgot password?
        </button>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50"
      >
        {loading ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}
