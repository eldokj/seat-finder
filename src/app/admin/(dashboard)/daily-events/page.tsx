import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePageParam } from "@/components/admin/Pagination";

export default async function DailyEventsListPage(props: PageProps<"/admin/daily-events">) {
  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams.page);
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const [{ data: events, error }, { count }] = await Promise.all([
    supabase
      .from("daily_examination_events")
      .select("*")
      .order("exam_date", { ascending: false })
      .order("session", { ascending: true })
      .range(from, to),
    supabase.from("daily_examination_events").select("id", { count: "exact", head: true }),
  ]);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  // Only the current page's events need their stats computed — pagination
  // also fixes what would otherwise be an ever-growing Promise.all fan-out
  // as sessions accumulate over semesters.
  const eventsWithCounts = error
    ? null
    : await Promise.all(
        (events ?? []).map(async (event) => {
          const [{ count: recordCount }, periodResult] = await Promise.all([
            supabase
              .from("master_timetable_records")
              .select("id", { count: "exact", head: true })
              .eq("daily_examination_event_id", event.id),
            event.examination_period_id
              ? supabase.from("examination_periods").select("name").eq("id", event.examination_period_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          return { event, recordCount: recordCount ?? 0, periodName: periodResult.data?.name ?? null };
        })
      );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Daily Exam Sessions</h1>
        <Link
          href="/admin/daily-events/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          + New Daily Exam Session
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Unable to load Daily Exam Sessions right now. Please try again shortly.
        </p>
      )}

      {eventsWithCounts && eventsWithCounts.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-800">No Daily Exam Sessions yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Upload a Master Timetable and sessions are created automatically for every Date + Session
            it contains.
          </p>
        </div>
      )}

      {eventsWithCounts && eventsWithCounts.length > 0 && (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Examination</th>
                  <th className="px-4 py-3">Timetable Records</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eventsWithCounts.map(({ event, recordCount, periodName }) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/daily-events/${event.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {formatLongDate(event.exam_date)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{event.session}</td>
                    <td className="px-4 py-3 text-slate-700">{periodName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{recordCount}</td>
                    <td className="px-4 py-3">
                      <DailyEventStatusBadge status={event.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} totalCount={totalCount} pageSize={DEFAULT_PAGE_SIZE} basePath="/admin/daily-events" />
        </>
      )}
    </div>
  );
}
