import Link from "next/link";
import { branding } from "@/lib/config/branding";

/** Phase 10 — root not-found page, catches notFound() calls or an
 * unmatched route anywhere outside the admin section. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-sm font-semibold text-slate-500">{branding.collegeName}</p>
      <p className="mt-4 text-lg font-semibold text-slate-800">Page not found.</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      <Link href="/" className="mt-6 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800">
        Go to Home
      </Link>
    </div>
  );
}
