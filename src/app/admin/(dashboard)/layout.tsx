import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { branding } from "@/lib/config/branding";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOutAction } from "./actions";

// Every admin page is session-specific — never statically prerender any of
// them (also avoids a build-time crash when Supabase env vars aren't set
// yet, since force-dynamic routes only ever run per-request, not at build
// time).
export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {branding.coeOfficeName}
            </p>
            <p className="text-lg font-bold leading-tight">Exam Seat Finder — Admin</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-300">{session.profile.full_name}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-600 px-3 py-1.5 font-medium text-white transition hover:bg-slate-800"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
        <AdminNav />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
