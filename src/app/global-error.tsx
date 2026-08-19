"use client";

import { useEffect } from "react";

/**
 * Phase 10 — catches an error thrown by the ROOT layout itself (unlikely
 * given how little layout.tsx does, but this is the only mechanism Next.js
 * provides for that case — a plain error.tsx cannot catch it). Must render
 * its own <html>/<body> since it fully replaces the root layout while
 * active.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-lg font-semibold text-slate-800">Something went wrong.</p>
        <p className="mt-2 max-w-sm text-sm text-slate-500">An unexpected error occurred. Please try again shortly.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
