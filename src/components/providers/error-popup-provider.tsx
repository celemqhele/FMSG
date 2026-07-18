"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { ErrorPopup } from "@/components/ui/error-popup";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileErrorPopup } from "@/components/dashboard/mobile/mobile-error-popup";

interface ErrorPopupContextValue {
  showError: (message: string) => void;
}

const ErrorPopupContext = createContext<ErrorPopupContextValue | null>(null);

export function ErrorPopupProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const showError = useCallback((msg: string) => {
    setMessage(msg);
  }, []);

  const handleClose = useCallback(() => {
    setMessage(null);
  }, []);

  return (
    <ErrorPopupContext.Provider value={{ showError }}>
      {children}
      {isMobile ? (
        <MobileErrorPopup message={message} onClose={handleClose} />
      ) : (
        <ErrorPopup message={message} onClose={handleClose} />
      )}
    </ErrorPopupContext.Provider>
  );
}

export function useErrorPopup(): ErrorPopupContextValue {
  const ctx = useContext(ErrorPopupContext);
  if (!ctx) throw new Error("useErrorPopup must be used within ErrorPopupProvider");
  return ctx;
}
