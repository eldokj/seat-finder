import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";
import { loadReportEvent, loadEventRooms } from "@/lib/admin/reports-data-io";
import { isNoticeBoardAllowed } from "@/lib/validation/reports";

const REPORT_LINK_CLASS = "block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300";

export default async function ReportsHubPage(props: PageProps<"/admin/reports/[eventId]">) {
  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const rooms = await loadEventRooms(supabase, eventId);
  const noticeBoardAllowed = isNoticeBoardAllowed(event.status);

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reports</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {formatLongDate(event.examDate)} — {event.session}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <DailyEventStatusBadge status={event.status} />
          <Link href="/admin/reports" className="text-sm font-medium text-slate-600 hover:underline">
            ← All Sessions
          </Link>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Event-wide Reports</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/admin/reports/${eventId}/date-session`} className={REPORT_LINK_CLASS}>
            <p className="font-semibold text-slate-900">Date/Session-wise Seating</p>
            <p className="text-sm text-slate-500">Grouped by room, the day-of master reference</p>
          </Link>
          <Link href={`/admin/reports/${eventId}/students`} className={REPORT_LINK_CLASS}>
            <p className="font-semibold text-slate-900">Student-wise Seating List</p>
            <p className="text-sm text-slate-500">Flat, sortable list of every seated student</p>
          </Link>
          <Link href={`/admin/reports/${eventId}/programme`} className={REPORT_LINK_CLASS}>
            <p className="font-semibold text-slate-900">Programme-wise Report</p>
            <p className="text-sm text-slate-500">Grouped by programme, with subtotals</p>
          </Link>
          <Link href={`/admin/reports/${eventId}/course`} className={REPORT_LINK_CLASS}>
            <p className="font-semibold text-slate-900">Course-wise Report</p>
            <p className="text-sm text-slate-500">Grouped by course, with subtotals</p>
          </Link>
          <Link href={`/admin/reports/${eventId}/capacity`} className={REPORT_LINK_CLASS}>
            <p className="font-semibold text-slate-900">Room Capacity/Utilization</p>
            <p className="text-sm text-slate-500">Physical positions, gaps, disabled, utilization %</p>
          </Link>
          {noticeBoardAllowed ? (
            <Link href={`/admin/reports/${eventId}/notice-board`} className={REPORT_LINK_CLASS}>
              <p className="font-semibold text-slate-900">Notice-Board Seating Copy</p>
              <p className="text-sm text-slate-500">Register No, Room, Seat only — for posting publicly</p>
            </Link>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4" title="Only available once this session is published">
              <p className="font-semibold text-slate-400">Notice-Board Seating Copy</p>
              <p className="text-sm text-slate-400">Available once this session is published</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Room-specific Reports</h2>
        {rooms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No rooms allocated to this session yet.
          </p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <div key={room.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="mb-2 font-semibold text-slate-900">
                  {room.roomNumber} <span className="text-sm font-normal text-slate-400">{room.code}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/reports/${eventId}/room/${room.id}/seating`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Seating Arrangement
                  </Link>
                  <Link href={`/admin/reports/${eventId}/room/${room.id}/attendance`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Attendance Sheet
                  </Link>
                  <Link href={`/admin/reports/${eventId}/room/${room.id}/invigilator`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Invigilator Report
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
