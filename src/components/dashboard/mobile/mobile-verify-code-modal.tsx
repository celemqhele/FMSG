"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface MobileVerifyCodeModalProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
  onVerified: () => void;
}

export function MobileVerifyCodeModal({ isOpen, email, onClose, onVerified }: MobileVerifyCodeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCode(["", "", "", "", "", ""]);
      setError("");
      setSuccess(false);
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRefs.current[0]) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const handleInput = (index: number, value: string) => {
    if (success) return;
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    setError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length > 0) {
      const next = [...code];
      for (let i = 0; i < 6; i++) next[i] = paste[i] ?? "";
      setCode(next);
      inputRefs.current[Math.min(paste.length - 1, 5)]?.focus();
    }
  };

  const verify = useCallback(async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Session expired. Please refresh."); setLoading(false); return; }
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => { onVerified(); onClose(); }, 1200);
      } else {
        setError(data.error ?? "Invalid code");
        setCode(["", "", "", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 200);
      }
    } catch {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  }, [code, onVerified, onClose]);

  useEffect(() => {
    if (code.every((d) => d !== "")) verify();
  }, [code, verify]);

  const handleResend = async () => {
    setResending(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setResendSent(true);
      setTimeout(() => setResendSent(false), 4000);
    } catch {}
    setResending(false);
  };

  if (!isOpen && !mounted) return null;

  const maskedEmail = email ? email.replace(/^(.{1,3}).*@(.+)$/, "$1***@$2") : "";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center transition-opacity duration-300" style={{ opacity: mounted ? 1 : 0 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute -top-2.5 -right-2.5 z-10 w-9 h-9 flex items-center justify-center bg-white border border-gray-300 rounded-full text-gray-600 hover:text-gray-900 transition-colors shadow-lg"
        >
          <X size={16} />
        </button>
        <div
          className="bg-white rounded-[16px] p-5 w-[min(80vw,320px)] mx-3 text-center transition-all duration-300 ease-out shadow-xl"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
        >
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Mail size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-[14px] font-semibold text-gray-900">Verify Your Email</h3>
          </div>
          <p className="text-[11px] text-gray-500 mb-4">Code sent to {maskedEmail}</p>

          {success ? (
            <p className="text-[11px] text-[var(--color-success)] font-medium">Verified!</p>
          ) : (
            <>
              <div className="flex justify-center gap-1 mb-3" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleInput(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`w-8 h-10 text-center text-[16px] font-bold rounded-[10px] border-2 transition-colors outline-none text-gray-900 ${
                      error ? "border-red-400 bg-red-50" : digit ? "border-[var(--color-accent)] bg-blue-50" : "border-gray-300 bg-gray-50"
                    }`}
                  />
                ))}
              </div>
              {error && <p className="text-[11px] text-red-500 mb-2.5">{error}</p>}
              {loading && (
                <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500 mb-2.5">
                  <Loader2 size={11} className="animate-spin" /> Verifying...
                </div>
              )}
              <button
                onClick={handleResend}
                disabled={resending || resendSent}
                className="text-[10px] text-gray-400 hover:text-[var(--color-accent)] transition-colors disabled:opacity-50"
              >
                {resending ? "Sending..." : resendSent ? "Code resent!" : "Didn't get it? Resend"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
