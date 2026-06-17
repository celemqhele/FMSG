export function Footer() {
  return (
    <footer className="px-6 py-12 border-t border-white/10">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start gap-1">
          <span className="text-lg font-semibold text-white select-none">
            FMSG
          </span>
          <p className="text-sm text-white/50">
            Find Me Some Jobs
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/50">
          <a href="/about" className="hover:text-white transition-colors">
            About
          </a>
          <a href="/pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
          <a href="/privacy" className="hover:text-white transition-colors">
            Privacy Policy
          </a>
          <a href="/articles" className="hover:text-white transition-colors">
            Articles
          </a>
        </div>
        <p className="text-sm text-white/50">
          &copy; 2025 Find Me Some Jobs
        </p>
      </div>
    </footer>
  );
}
