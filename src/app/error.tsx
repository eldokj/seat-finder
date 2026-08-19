"use client";

import { useEffect } from "react";

/**
 * Phase 10 — root error boundary. Catches anything an unexpected server or
 * render error throws anywhere in the app that isn't caught by a more
 * specific boundary (e.g. the admin dashboard's own error.tsx). Never
 * shows the raw error message/stack to the user — only logs it
 * server-side-visibly via console.error (this project defers external
 * error-reporting/monitoring per the approved Phase 10 decision).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-lg font-semibold text-slate-800">Something went wrong.</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        An unexpected error occurred. Please try again, or contact the COE Office if this keeps happening.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  );
}
