"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function BlockedAccountPage() {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (reason.trim().length < 20) {
      setError("Please provide at least 20 characters explaining your situation.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Session expired. Please refresh."); setLoading(false); return; }

      const res = await fetch("/api/auth/appeal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <ShieldAlert size={48} className="text-red-400 mb-4" />

      <h2 className="text-xl font-bold text-white mb-2">Account Disabled</h2>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-md mb-8">
        Suspicious activity was detected from your account. If you believe this is a mistake, you can submit an appeal below.
      </p>

      {submitted ? (
        <div className="liquid-glass rounded-xl p-6 max-w-md w-full">
          <p className="text-sm text-[var(--color-success)] font-medium mb-1">Appeal submitted</p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            We will review your appeal within 24 hours.
          </p>
        </div>
      ) : (
        <div className="liquid-glass rounded-xl p-6 max-w-md w-full text-left">
          <label className="text-sm font-medium text-white mb-2 block">
            Explain your situation
          </label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(""); }}
            placeholder="I believe my account was disabled by mistake because..."
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-white/5 text-white text-sm px-4 py-3 resize-none placeholder:text-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors mb-3"
          />
          {error && (
            <p className="text-sm text-red-400 mb-3">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || reason.trim().length < 20}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? "Submitting..." : "Submit Appeal"}
          </button>
        </div>
      )}
    </div>
  );
}
