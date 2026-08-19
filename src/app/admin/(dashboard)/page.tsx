import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTodayDateString, formatLongDate } from "@/lib/utils/date";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";
import type { DailyExaminationEvent } from "@/types/database";

interface EventStats {
  timetableRecordCount: number;
  totalStrength: number;
  allocatedCount: number;
  roomsUsed: number;
}

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const today = getTodayDateString();

  const { data: events, error } = await supabase
    .from("daily_examination_events")
    .select("*")
    .eq("exam_date", today)
    .order("session", { ascending: true });

  const eventsWithStats = error
    ? null
    : await Promise.all(
        (events ?? []).map(async (event) => ({ event, stats: await getEventStats(supabase, event.id) }))
      );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">{formatLongDate(today)}</p>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Unable to load today&apos;s Daily Exam Sessions right now. Please try again shortly.
        </p>
      )}

      {eventsWithStats && eventsWithStats.length === 0 && <NoEventToday />}

      {eventsWithStats && eventsWithStats.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {eventsWithStats.map(({ event, stats }) => (
            <EventCard key={event.id} event={event} stats={stats} />
          ))}
        </div>
      )}
    </div>
  );
}

async function getEventStats(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  eventId: string
): Promise<EventStats> {
  const [{ data: timetableRecords }, { data: allocationRows }] = await Promise.all([
    supabase.from("master_timetable_records").select("strength").eq("daily_examination_event_id", eventId),
    supabase.from("seat_allocations").select("room_id").eq("daily_examination_event_id", eventId),
  ]);

  const timetableRecordCount = timetableRecords?.length ?? 0;
  const totalStrength = (timetableRecords ?? []).reduce((sum, r) => sum + r.strength, 0);

  // "Allocated" means a room has actually been assigned — a participating-
  // but-unseated seat_allocations row (room_id null) doesn't count yet.
  const seatedRows = (allocationRows ?? []).filter((row) => row.room_id !== null);
  const allocatedCount = seatedRows.length;
  const roomsUsed = new Set(seatedRows.map((row) => row.room_id)).size;

  return { timetableRecordCount, totalStrength, allocatedCount, roomsUsed };
}

function NoEventToday() {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-slate-800">No Daily Exam Session scheduled for today.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">The daily workflow is:</p>
      <ol className="mx-auto mt-4 max-w-xs list-decimal space-y-1 text-left text-sm text-slate-600">
        <li>Create or select today&apos;s Daily Exam Session</li>
        <li>Upload the Master Timetable and Student Roster</li>
        <li>Validate the data</li>
        <li>Review and publish</li>
        <li>Students search by Register Number</li>
      </ol>
      <Link
        href="/admin/daily-events/new"
        className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        + Create Event
      </Link>
    </div>
  );
}

function EventCard({ event, stats }: { event: DailyExaminationEvent; stats: EventStats }) {
  return (
    <Link
      href={`/admin/daily-events/${event.id}`}
      className="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">Session {event.session}</p>
          <p className="text-sm text-slate-500">
            {stats.timetableRecordCount} timetable record{stats.timetableRecordCount === 1 ? "" : "s"} ·{" "}
            {stats.totalStrength} students expected
          </p>
        </div>
        <DailyEventStatusBadge status={event.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Allocated</dt>
          <dd className="text-xl font-bold text-slate-900">{stats.allocatedCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Rooms Used</dt>
          <dd className="text-xl font-bold text-slate-900">{stats.roomsUsed}</dd>
        </div>
      </dl>
    </Link>
  );
}
