import Link from "next/link";

interface CourseDataRow {
  id: string;
  daily_examination_event_id: string;
  programme: string;
  course_code: string;
  course_name: string;
  year: number;
  term: number;
  strength: number;
  event?: { id: string; exam_date: string; session: string };
}

interface CourseDataFilters {
  year?: string;
  term?: string;
  programme?: string;
  courseCode?: string;
}

interface CourseDataOptions {
  years: number[];
  terms: number[];
  programmes: string[];
  courseCodes: string[];
}

/** Server-rendered, no-JS GET filter form + table (approved decision #10) —
 * Year/Term/Programme/Course filters over every course currently on record,
 * across every Daily Exam Session. A plain <form method="get"> keeps this a
 * server component: submitting re-navigates to /admin/exam-data with the
 * chosen query params, which the page re-reads and re-filters server-side. */
export function CourseDataTable({
  rows,
  filters,
  options,
}: {
  rows: CourseDataRow[];
  filters: CourseDataFilters;
  options: CourseDataOptions;
}) {
  const hasActiveFilters = Boolean(filters.year || filters.term || filters.programme || filters.courseCode);

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <form method="get" className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <FilterSelect name="year" label="Year" value={filters.year} options={options.years.map(String)} />
        <FilterSelect name="term" label="Term" value={filters.term} options={options.terms.map(String)} />
        <FilterSelect name="programme" label="Programme" value={filters.programme} options={options.programmes} />
        <FilterSelect name="course" label="Course" value={filters.courseCode} options={options.courseCodes} />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <Link
              href="/admin/exam-data"
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          {hasActiveFilters ? "No courses match these filters." : "No course data on record yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Programme</th>
                <th className="px-4 py-3">Course Code</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Strength</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/daily-events/${r.daily_examination_event_id}`} className="font-medium text-slate-900 hover:underline">
                      {r.event?.exam_date}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.event?.session}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{r.year}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{r.term}</td>
                  <td className="px-4 py-3 text-slate-700">{r.programme}</td>
                  <td className="px-4 py-3 text-slate-700">{r.course_code}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-700" title={r.course_name}>
                    {r.course_name}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{r.strength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: string[];
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
