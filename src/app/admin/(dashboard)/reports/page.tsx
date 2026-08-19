import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePageParam } from "@/components/admin/Pagination";

export default async function ReportsIndexPage(props: PageProps<"/admin/reports">) {
  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams.page);
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const [{ data: events }, { count }] = await Promise.all([
    supabase
      .from("daily_examination_events")
      .select("id, exam_date, session, status")
      .order("exam_date", { ascending: false })
      .order("session", { ascending: true })
      .range(from, to),
    supabase.from("daily_examination_events").select("id", { count: "exact", head: true }),
  ]);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <Link href="/admin/reports/qr-poster" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          QR Poster / Quick Access
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">Choose a Daily Exam Session to generate reports for.</p>

      {(!events || events.length === 0) && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-800">No Daily Exam Sessions yet.</p>
        </div>
      )}

      {events && events.length > 0 && (
        <>
          <div className="mt-6 divide-y divide-slate-100 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {events.map((event) => (
              <Link key={event.id} href={`/admin/reports/${event.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-900">
                  {formatLongDate(event.exam_date)} — {event.session}
                </span>
                <DailyEventStatusBadge status={event.status} />
              </Link>
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} totalCount={totalCount} pageSize={DEFAULT_PAGE_SIZE} basePath="/admin/reports" />
        </>
      )}
    </div>
  );
}
