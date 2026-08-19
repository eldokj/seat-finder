import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { branding } from "@/lib/config/branding";
import { LoginForm } from "./LoginForm";

// Session-specific (checks whether the visitor is already signed in) — see
// the same note in app/admin/(dashboard)/layout.tsx.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-slate-100 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {branding.coeOfficeName}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Admin Sign In</h1>
          <p className="mt-1 text-sm text-slate-500">{branding.collegeName}</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          For COE / examination office staff only.
        </p>
      </div>
    </div>
  );
}
