import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { DailyEventStatusBadge } from "@/components/admin/DailyEventStatusBadge";
import { ErrorBanner } from "@/components/admin/ErrorBanner";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { DailyEventForm } from "../DailyEventForm";
import { RoomAllocationForm } from "../RoomAllocationForm";
import {
  updateDailyEventAction,
  publishDailyEventAction,
  unpublishDailyEventAction,
  closeDailyEventAction,
  deleteDailyEventAction,
  setRoomAllocationsAction,
} from "../actions";
import { compareTimetableToRoster, hasUnresolvedMismatches } from "@/lib/validation/timetable-roster-comparison";
import type { ImportBatch } from "@/types/database";

const actionButtonClass =
  "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed";

export default async function DailyEventDetailPage(props: PageProps<"/admin/daily-events/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = typeof searchParams.error === "string" ? searchParams.error : undefined;

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("daily_examination_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const [
    { data: timetableRecords },
    { data: registrationRows },
    { data: importBatches },
    { data: period },
    { data: allPeriods },
    { data: activeRooms },
    { data: roomAllocations },
  ] = await Promise.all([
    supabase
      .from("master_timetable_records")
      .select("*")
      .eq("daily_examination_event_id", event.id)
      .order("year", { ascending: true })
      .order("term", { ascending: true })
      .order("programme", { ascending: true }),
    supabase
      .from("seat_allocations")
      .select("master_timetable_record_id")
      .eq("daily_examination_event_id", event.id),
    supabase
      .from("import_batches")
      .select("*")
      .eq("daily_examination_event_id", event.id)
      .order("created_at", { ascending: false }),
    event.examination_period_id
      ? supabase.from("examination_periods").select("id, name").eq("id", event.examination_period_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("examination_periods").select("id, name, start_date, end_date").order("start_date", { ascending: false }),
    supabase.from("rooms").select("id, room_number, code, usable_seats, additional_seats").eq("status", "active").order("display_order", { ascending: true }),
    supabase.from("room_allocations").select("room_id").eq("daily_examination_event_id", event.id),
  ]);

  const boundUpdate = updateDailyEventAction.bind(null, event.id);
  const boundPublish = publishDailyEventAction.bind(null, event.id);
  const boundUnpublish = unpublishDailyEventAction.bind(null, event.id);
  const boundClose = closeDailyEventAction.bind(null, event.id);
  const boundDelete = deleteDailyEventAction.bind(null, event.id);
  const boundRoomAllocation = setRoomAllocationsAction.bind(null, event.id);
  const selectedRoomIds = (roomAllocations ?? []).map((r) => r.room_id);

  const totalStrength = (timetableRecords ?? []).reduce((sum, r) => sum + r.strength, 0);

  const rosterCountByRecord = new Map<string, number>();
  for (const row of registrationRows ?? []) {
    rosterCountByRecord.set(
      row.master_timetable_record_id,
      (rosterCountByRecord.get(row.master_timetable_record_id) ?? 0) + 1
    );
  }

  const comparisonRows = compareTimetableToRoster(
    (timetableRecords ?? []).map((r) => ({
      masterTimetableRecordId: r.id,
      programme: r.programme,
      courseCode: r.course_code,
      courseName: r.course_name,
      timetableStrength: r.strength,
      rosterCount: rosterCountByRecord.get(r.id) ?? 0,
    }))
  );
  const hasMismatches = hasUnresolvedMismatches(comparisonRows);

  const examDataImportHref = period ? `/admin/exam-data?period=${period.id}` : "/admin/exam-data";

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Daily Exam Session</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {formatLongDate(event.exam_date)} — {event.session}
          </h1>
          {period ? (
            <p className="text-sm text-slate-500">
              Examination:{" "}
              <Link href={`/admin/examination-periods/${period.id}`} className="font-medium text-slate-700 hover:underline">
                {period.name}
              </Link>
            </p>
          ) : (
            <p className="text-sm text-amber-600">No examination period linked yet.</p>
          )}
        </div>
        <DailyEventStatusBadge status={event.status} />
      </div>

      {errorMessage && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {event.status === "draft" && (
          <>
            <form action={boundPublish}>
              <ConfirmButton
                type="submit"
                confirmMessage="Are you sure you want to publish this Daily Exam Session? Students will immediately be able to search for their seat, for any timetable record that has allocations."
                className={`${actionButtonClass} bg-green-700 text-white hover:bg-green-800`}
              >
                Publish
              </ConfirmButton>
            </form>
            <form action={boundDelete}>
              <ConfirmButton
                type="submit"
                confirmMessage="Delete this draft Daily Exam Session? This cannot be undone."
                className={`${actionButtonClass} border border-red-300 text-red-700 hover:bg-red-50`}
              >
                Delete
              </ConfirmButton>
            </form>
          </>
        )}

        {event.status === "published" && (
          <>
            <form action={boundClose}>
              <ConfirmButton
                type="submit"
                confirmMessage="Are you sure you want to close this Daily Exam Session? Students will no longer be able to search their seat."
                className={`${actionButtonClass} bg-slate-800 text-white hover:bg-slate-900`}
              >
                Close
              </ConfirmButton>
            </form>
            <form action={boundUnpublish}>
              <ConfirmButton
                type="submit"
                confirmMessage="Unpublish this Daily Exam Session and revert it to draft? Students will no longer be able to search their seat."
                className={`${actionButtonClass} border border-slate-300 text-slate-700 hover:bg-slate-50`}
              >
                Unpublish
              </ConfirmButton>
            </form>
          </>
        )}

        {event.status === "closed" && (
          <p className="text-sm text-slate-500">This Daily Exam Session is closed. Its details can no longer be changed.</p>
        )}
      </div>

      {hasMismatches && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Timetable/Roster strength mismatch detected below — resolve before seating allocation.
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Master Timetable</h2>
          <Link
            href={examDataImportHref}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Import Exam Data
          </Link>
        </div>

        {(!timetableRecords || timetableRecords.length === 0) && (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No course records yet for this session — use Exam Data Import to add them.
          </p>
        )}

        {timetableRecords && timetableRecords.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Programme</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Course Code</th>
                  <th className="px-4 py-3">Strength</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timetableRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 tabular-nums">{record.year}</td>
                    <td className="px-4 py-3 tabular-nums">{record.term}</td>
                    <td className="px-4 py-3">{record.programme}</td>
                    <td className="px-4 py-3">{record.course_name}</td>
                    <td className="px-4 py-3">{record.course_code}</td>
                    <td className="px-4 py-3">{record.strength}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-4 py-3" colSpan={5}>
                    Total Students
                  </td>
                  <td className="px-4 py-3">{totalStrength}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Student Registrations</h2>

        {comparisonRows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No course records yet — use Exam Data Import above to add courses and students together.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Programme</th>
                  <th className="px-4 py-3">Course Code</th>
                  <th className="px-4 py-3">Timetable Strength</th>
                  <th className="px-4 py-3">Roster Count</th>
                  <th className="px-4 py-3">Difference</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonRows.map((row) => (
                  <tr key={row.masterTimetableRecordId}>
                    <td className="px-4 py-3">{row.programme}</td>
                    <td className="px-4 py-3">{row.courseCode}</td>
                    <td className="px-4 py-3">{row.timetableStrength}</td>
                    <td className="px-4 py-3">{row.rosterCount}</td>
                    <td className="px-4 py-3">{row.difference > 0 ? `+${row.difference}` : row.difference}</td>
                    <td className="px-4 py-3">
                      {row.status === "match" ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold uppercase text-green-800">
                          Match
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-800">
                          ⚠️ Mismatch
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Import History</h2>
        {!importBatches || importBatches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No uploads yet for this session.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Valid</th>
                  <th className="px-4 py-3">Warnings</th>
                  <th className="px-4 py-3">Errors</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importBatches.map((batch: ImportBatch) => (
                  <tr key={batch.id}>
                    <td className="px-4 py-3 capitalize">{batch.import_type}</td>
                    <td className="max-w-[160px] truncate px-4 py-3" title={batch.file_name ?? undefined}>
                      {batch.file_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(batch.created_at).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">{batch.total_rows}</td>
                    <td className="px-4 py-3 text-green-700">{batch.valid_rows}</td>
                    <td className="px-4 py-3 text-amber-700">{batch.warning_rows}</td>
                    <td className="px-4 py-3 text-red-700">{batch.error_rows}</td>
                    <td className="px-4 py-3 capitalize">{batch.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Room Allocation</h2>
        <p className="mb-3 text-sm text-slate-500">Which rooms serve this session — required before Seating Allocation can run.</p>
        <RoomAllocationForm action={boundRoomAllocation} rooms={activeRooms ?? []} selectedRoomIds={selectedRoomIds} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Seating Allocation</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/daily-events/${event.id}/seating-rules`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Seating Rules
          </Link>
          <Link
            href={`/admin/daily-events/${event.id}/seating`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Seating Workspace
          </Link>
        </div>
      </section>

      {event.status !== "closed" && (
        <div className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Daily Exam Session Details</h2>
          <DailyEventForm mode="edit" action={boundUpdate} periods={allPeriods ?? []} defaultValues={event} />
        </div>
      )}
    </div>
  );
}
