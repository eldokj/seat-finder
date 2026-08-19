import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SeatingRuleForm } from "@/components/admin/SeatingRuleForm";
import { loadSeatingRuleSetInput } from "@/lib/admin/seating-rules-io";
import { saveGlobalSeatingRulesAction } from "./actions";

export default async function GlobalSeatingRulesPage() {
  const supabase = await createSupabaseServerClient();
  const defaultValues = await loadSeatingRuleSetInput(supabase, "global", null);

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Seating Rules — Global Defaults</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/seating-rules/export"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export JSON
          </a>
          <Link
            href="/admin/seating-rules/import-export"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Import JSON
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Applied to every Daily Exam Session unless that session sets its own rule for the same setting. Configure a
        session-specific override from that session&apos;s detail page.
      </p>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <SeatingRuleForm
          action={saveGlobalSeatingRulesAction}
          defaultValues={defaultValues}
          scopeDescription="all Daily Exam Sessions, unless a session overrides a specific setting"
        />
      </div>
    </div>
  );
}
