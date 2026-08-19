import Link from "next/link";

/** Phase 10 — admin-section not-found, preserves the AdminNav chrome
 * (rooms/events/etc. that don't exist redirect here via notFound() already
 * used throughout the admin routes). */
export default function AdminNotFound() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-slate-800">Not found.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">This item doesn&apos;t exist, or may have been deleted.</p>
      <Link href="/admin" className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
        Back to Dashboard
      </Link>
    </div>
  );
}
