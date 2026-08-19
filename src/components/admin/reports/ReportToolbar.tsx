"use client";

import Link from "next/link";

interface ReportToolbarProps {
  backHref: string;
  exportHref?: string;
}

/** Print + (optional) Excel export buttons — hidden when actually printing
 * (print:hidden), so only the report content itself ends up on paper. */
export function ReportToolbar({ backHref, exportHref }: ReportToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <Link href={backHref} className="text-sm font-medium text-slate-600 hover:underline">
        ← Back to Reports
      </Link>
      <div className="ml-auto flex gap-2">
        {exportHref && (
          <a
            href={exportHref}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Export Excel
          </a>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
