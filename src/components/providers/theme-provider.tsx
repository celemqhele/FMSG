"use client";

import { createContext, useContext, type ReactNode } from "react";

interface ThemeContextValue {
  theme: "dark";
  resolved: "dark";
  setTheme: () => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: "dark", resolved: "dark", setTheme: () => {}, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
