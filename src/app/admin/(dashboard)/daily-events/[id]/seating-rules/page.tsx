import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { SeatingRuleForm } from "@/components/admin/SeatingRuleForm";
import { loadSeatingRuleSetInput } from "@/lib/admin/seating-rules-io";
import { saveEventSeatingRulesAction } from "./actions";

export default async function EventSeatingRulesPage(props: PageProps<"/admin/daily-events/[id]/seating-rules">) {
  const { id } = await props.params;

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("daily_examination_events")
    .select("id, exam_date, session")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  const defaultValues = await loadSeatingRuleSetInput(supabase, "daily_examination_event", id);
  const boundAction = saveEventSeatingRulesAction.bind(null, id);

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Seating Rules</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {formatLongDate(event.exam_date)} — {event.session}
          </h1>
        </div>
        <Link href={`/admin/daily-events/${id}`} className="text-sm font-medium text-slate-600 hover:underline">
          ← Back to Session
        </Link>
      </div>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <SeatingRuleForm
          action={boundAction}
          defaultValues={defaultValues}
          scopeDescription="this Daily Exam Session only — overrides the global default rule by rule; a setting left unconfigured here falls back to the global default"
        />
      </div>
    </div>
  );
}
