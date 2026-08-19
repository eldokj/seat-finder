"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Phase 10 — admin-section error boundary. Catches errors from any page
 * inside the (dashboard) route group (Rooms, Seating, Reports, etc.)
 * without tearing down the AdminNav — an admin stays oriented and can
 * navigate elsewhere even if one screen fails.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin section error:", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-dashed border-red-300 bg-red-50 p-8 text-center">
      <p className="text-lg font-semibold text-red-800">Something went wrong loading this page.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-red-600">
        Please try again. If this keeps happening, check the Supabase project status or contact IT support.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Try again
        </button>
        <Link href="/admin" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
