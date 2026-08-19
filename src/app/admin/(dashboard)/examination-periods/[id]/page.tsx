import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { ExaminationPeriodStatusBadge } from "@/components/admin/ExaminationPeriodStatusBadge";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";
import { ExaminationPeriodForm } from "../ExaminationPeriodForm";
import { updateExaminationPeriodAction } from "../actions";

export default async function ExaminationPeriodDetailPage(props: PageProps<"/admin/examination-periods/[id]">) {
  const { id } = await props.params;

  const supabase = await createSupabaseServerClient();
  const { data: period } = await supabase
    .from("examination_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!period) notFound();

  const { data: sessions } = await supabase
    .from("daily_examination_events")
    .select("*")
    .eq("examination_period_id", period.id)
    .order("exam_date", { ascending: true })
    .order("session", { ascending: true });

  const boundUpdate = updateExaminationPeriodAction.bind(null, period.id);

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{period.name}</h1>
          <p className="text-sm text-slate-500">
            {formatLongDate(period.start_date)} – {formatLongDate(period.end_date)}
          </p>
        </div>
        <ExaminationPeriodStatusBadge status={period.status} />
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Daily Exam Sessions</h2>
          <Link
            href={`/admin/exam-data?period=${period.id}`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Import Exam Data
          </Link>
        </div>

        {(!sessions || sessions.length === 0) && (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No Daily Exam Sessions yet. Import exam data for this examination and one will be created
            automatically for every Date + Session it contains.
          </p>
        )}

        {sessions && sessions.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/daily-events/${session.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {formatLongDate(session.exam_date)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{session.session}</td>
                    <td className="px-4 py-3">
                      <DailyEventStatusBadge status={session.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Examination Details</h2>
        <ExaminationPeriodForm mode="edit" action={boundUpdate} defaultValues={period} />
      </div>
    </div>
  );
}
