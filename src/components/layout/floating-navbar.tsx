"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import "../landing/liquid-glass.css";

interface FloatingNavbarProps {
  onLoginClick: () => void;
  onSignUpClick: () => void;
}

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

export function FloatingNavbar({ onLoginClick, onSignUpClick }: FloatingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
      <div className="liquid-glass-surface flex items-center justify-between px-6 py-3 rounded-2xl">
        <a href="/" className="text-lg font-semibold text-white select-none">
          FMSG
        </a>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onLoginClick}
            className="px-5 py-2 text-sm font-medium text-white hover:text-white/70 transition-colors"
          >
            Log In
          </button>
          <button
            onClick={onSignUpClick}
            className="px-5 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
          >
            Sign Up
          </button>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-white"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden mt-2 liquid-glass rounded-2xl">
          <div className="flex flex-col gap-1 p-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="w-full px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <hr className="my-2 border-white/10" />
            <button
              onClick={() => { onLoginClick(); setMobileMenuOpen(false); }}
              className="w-full px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white transition-colors text-left rounded-lg hover:bg-white/5"
            >
              Log In
            </button>
            <button
              onClick={() => { onSignUpClick(); setMobileMenuOpen(false); }}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors text-center mt-1"
            >
              Sign Up
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
