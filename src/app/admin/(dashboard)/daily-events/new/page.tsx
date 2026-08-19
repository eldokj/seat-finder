import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DailyEventForm } from "../DailyEventForm";
import { createDailyEventAction } from "../actions";

export default async function NewDailyEventPage() {
  const supabase = await createSupabaseServerClient();
  const { data: periods } = await supabase
    .from("examination_periods")
    .select("id, name, start_date, end_date")
    .order("start_date", { ascending: false });

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900">New Daily Exam Session</h1>
      <p className="mt-1 text-sm text-slate-500">
        One session per date + session — it starts as a draft. Normally you won&apos;t need this form:
        uploading the Master Timetable creates sessions automatically. Use this only to set one up
        ahead of time.
      </p>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <DailyEventForm mode="create" action={createDailyEventAction} periods={periods ?? []} />
      </div>
    </div>
  );
}
