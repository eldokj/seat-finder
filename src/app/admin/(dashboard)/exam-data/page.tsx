import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { ExaminationPeriodStatusBadge } from "@/components/admin/ExaminationPeriodStatusBadge";
import { ConsolidatedUploadForm } from "./ConsolidatedUploadForm";
import { CourseDataTable } from "./CourseDataTable";

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function ConsolidatedExamDataPage(props: PageProps<"/admin/exam-data">) {
  const searchParams = await props.searchParams;
  const initialPeriodId = typeof searchParams.period === "string" ? searchParams.period : undefined;

  // Course Data filters (approved decision #10) — Year/Term/Programme/Course,
  // all optional, combined with AND. Read-only view; doesn't affect upload.
  const filters = {
    year: firstParam(searchParams.year),
    term: firstParam(searchParams.term),
    programme: firstParam(searchParams.programme),
    courseCode: firstParam(searchParams.course),
  };

  const supabase = await createSupabaseServerClient();
  const [{ data: periods }, { data: recentPeriods }, { data: allRecords }] = await Promise.all([
    supabase.from("examination_periods").select("id, name, start_date, end_date").order("start_date", { ascending: false }),
    supabase.from("examination_periods").select("*").order("start_date", { ascending: false }).limit(10),
    supabase
      .from("master_timetable_records")
      .select("id, daily_examination_event_id, programme, course_code, course_name, year, term, strength"),
  ]);

  // Flat in-memory join (project convention — avoids PostgREST embedded
  // selects, see CLAUDE.md): pull the events these records belong to, then
  // stitch Date/Session onto each course row.
  const eventIds = Array.from(new Set((allRecords ?? []).map((r) => r.daily_examination_event_id)));
  const { data: events } =
    eventIds.length > 0
      ? await supabase.from("daily_examination_events").select("id, exam_date, session").in("id", eventIds)
      : { data: [] };
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));

  const courseRows = (allRecords ?? [])
    .map((r) => ({ ...r, event: eventById.get(r.daily_examination_event_id) }))
    .filter((r) => r.event !== undefined)
    .filter((r) => (filters.year ? String(r.year) === filters.year : true))
    .filter((r) => (filters.term ? String(r.term) === filters.term : true))
    .filter((r) => (filters.programme ? r.programme === filters.programme : true))
    .filter((r) => (filters.courseCode ? r.course_code === filters.courseCode : true))
    .sort(
      (a, b) =>
        a.event!.exam_date.localeCompare(b.event!.exam_date) ||
        a.event!.session.localeCompare(b.event!.session) ||
        a.programme.localeCompare(b.programme) ||
        a.course_code.localeCompare(b.course_code)
    );

  // Distinct option lists for the filter dropdowns, derived from ALL records
  // (not the already-filtered set) so every filter's options stay complete
  // regardless of what's currently selected.
  const filterOptions = {
    years: Array.from(new Set((allRecords ?? []).map((r) => r.year))).sort((a, b) => a - b),
    terms: Array.from(new Set((allRecords ?? []).map((r) => r.term))).sort((a, b) => a - b),
    programmes: Array.from(new Set((allRecords ?? []).map((r) => r.programme))).sort(),
    courseCodes: Array.from(new Set((allRecords ?? []).map((r) => r.course_code))).sort(),
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Consolidated Exam + Student Import</h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload one Excel file containing examination, course and student registration data. The
        system automatically creates/updates the required examination sessions, courses and student
        registrations. Separate Timetable and Student Roster uploads are not required.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Strength is calculated automatically from the number of student records in the uploaded
        data — there&apos;s no Strength column to fill in.
      </p>

      <div className="mt-6">
        <ConsolidatedUploadForm periods={periods ?? []} initialPeriodId={initialPeriodId} />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Course Data</h2>
        <p className="mb-3 text-xs text-slate-500">
          Every course currently on record, across every Daily Exam Session — filter by Year (batch),
          Term (semester), Programme, or Course to browse batch/term-wise.
        </p>
        <CourseDataTable rows={courseRows} filters={filters} options={filterOptions} />
      </div>

      {recentPeriods && recentPeriods.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent Examination Periods
          </h2>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[460px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Examination</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPeriods.map((period) => (
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
                    <td className="px-4 py-3">
                      <ExaminationPeriodStatusBadge status={period.status} />
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/api/admin/exam-data/export?period=${period.id}`}
                        className="text-xs font-semibold text-slate-600 underline hover:text-slate-900"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
