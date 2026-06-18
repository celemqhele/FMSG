"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SignUpData {
  email: string;
  password: string;
  name: string;
  surname: string;
  autoConfirmed: boolean;
}

export function SignUpForm({ onSuccess }: { onSuccess: (data: SignUpData) => void }) {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();

    const fullName = [name, surname].filter(Boolean).join(" ");

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
      },
    });

    setLoading(false);

    if (signUpErr) {
      if (signUpErr.message.includes("already registered")) {
        setError("An account with this email already exists.");
      } else {
        setError(signUpErr.message);
      }
      return;
    }

    onSuccess({
      email,
      password,
      name,
      surname,
      autoConfirmed: !!data.session,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="signup-name" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
            Name
          </label>
          <input
            id="signup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            placeholder="Your name"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="signup-surname" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
            Surname
          </label>
          <input
            id="signup-surname"
            type="text"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            placeholder="Your surname"
          />
        </div>
      </div>
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          placeholder="At least 6 characters"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50"
      >
        {loading ? "Creating account..." : "Create Account"}
      </button>
    </form>
  );
}
