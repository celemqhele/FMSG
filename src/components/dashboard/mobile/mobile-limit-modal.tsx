"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

interface MobileLimitModalProps {
  code: string | null;
  plan: string;
  onClose: () => void;
  onOpenPfModal: () => void;
}

export function MobileLimitModal({ code, plan, onClose, onOpenPfModal }: MobileLimitModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (code) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [code]);

  if (!code) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end transition-opacity duration-300" style={{ opacity: mounted ? 1 : 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full bg-[var(--color-error)] rounded-t-2xl p-6 text-center space-y-4 safe-area-bottom transition-all duration-300 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(20px)",
        }}
      >
        <button onClick={onClose} className="absolute top-3 right-3 p-2.5 text-white/60 hover:text-white">
          <X size={18} />
        </button>

        <p className="text-white font-semibold">
          {code === "LIMIT_001" ? "No searches remaining" :
           code === "LIMIT_002" ? "No CV generations remaining" :
           code === "LIMIT_003" ? "No Persistent Finder rounds remaining" :
           "No remaining credits"}
        </p>
        <p className="text-sm text-white/90">
          {code === "LIMIT_001" ? "Top up to continue searching." :
           code === "LIMIT_002" ? "Top up to generate more CVs." :
           code === "LIMIT_003" ? "Unlock Persistent Finder to find more matches." :
           "Top up to continue."}
        </p>
        {(code === "LIMIT_003" || (code === "LIMIT_001" && plan === "free") || (code === "LIMIT_002" && plan === "free")) && (
          <p className="text-xs text-white/70 font-medium">
            85% off Seeker / 60% off Hunter & Pro, first purchase only
          </p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              onClose();
              if (code === "LIMIT_003" || (code === "LIMIT_001" && plan === "free") || (code === "LIMIT_002" && plan === "free")) {
                router.push("/upgrade?discount=first_order_85");
              } else {
                router.push("/upgrade");
              }
            }}
            className="px-6 py-2.5 text-sm font-semibold text-[var(--color-error)] bg-white rounded-full"
          >
            Top Up
          </button>
          {code === "LIMIT_003" && (
            <button
              onClick={() => { onClose(); onOpenPfModal(); }}
              className="px-6 py-2.5 text-sm font-medium text-white border border-white/50 rounded-full"
            >
              Buy PF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
