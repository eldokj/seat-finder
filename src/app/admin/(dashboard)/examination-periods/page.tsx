import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { ExaminationPeriodStatusBadge } from "@/components/admin/ExaminationPeriodStatusBadge";

export default async function ExaminationPeriodsListPage() {
  const supabase = await createSupabaseServerClient();

  const { data: periods, error } = await supabase
    .from("examination_periods")
    .select("*")
    .order("start_date", { ascending: false });

  const periodsWithSessionCounts = error
    ? null
    : await Promise.all(
        (periods ?? []).map(async (period) => {
          const { count } = await supabase
            .from("daily_examination_events")
            .select("id", { count: "exact", head: true })
            .eq("examination_period_id", period.id);
          return { period, sessionCount: count ?? 0 };
        })
      );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Examination Periods</h1>
        <Link
          href="/admin/examination-periods/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          + New Examination Period
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Unable to load examination periods right now. Please try again shortly.
        </p>
      )}

      {periodsWithSessionCounts && periodsWithSessionCounts.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-800">No examination periods yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Create one (e.g. &quot;Mid Semester Examination&quot;, 18–22 Aug 2026) before uploading its
            Master Timetable.
          </p>
        </div>
      )}

      {periodsWithSessionCounts && periodsWithSessionCounts.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Examination</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Daily Exam Sessions</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periodsWithSessionCounts.map(({ period, sessionCount }) => (
                <tr key={period.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/examination-periods/${period.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {period.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatLongDate(period.start_date)} – {formatLongDate(period.end_date)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{sessionCount}</td>
                  <td className="px-4 py-3">
                    <ExaminationPeriodStatusBadge status={period.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
