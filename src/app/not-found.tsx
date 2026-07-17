import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4">
      <div className="text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
          <span className="text-3xl font-bold text-white/30">404</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Page not found</h1>
          <p className="text-sm text-white/60 max-w-sm">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
