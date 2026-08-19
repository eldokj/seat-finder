import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";

export default async function SeatingChooserPage() {
  const supabase = await createSupabaseServerClient();
  const { data: events } = await supabase
    .from("daily_examination_events")
    .select("*")
    .neq("status", "closed")
    .order("exam_date", { ascending: false })
    .order("session", { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Seating Allocation</h1>
      <p className="mt-1 text-sm text-slate-500">Choose a Daily Exam Session to allocate seating for.</p>

      {(!events || events.length === 0) && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-800">No open Daily Exam Sessions.</p>
          <p className="mt-2 text-sm text-slate-500">
            Closed sessions aren&apos;t shown here — reopen from the session&apos;s detail page if needed.
          </p>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="mt-6 divide-y divide-slate-100 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/admin/daily-events/${event.id}/seating`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">
                {formatLongDate(event.exam_date)} — {event.session}
              </span>
              <DailyEventStatusBadge status={event.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
