/** Approved decision #12 — Year/Term filter for the Student-wise,
 * Programme-wise, and Course-wise reports only. Plain GET form (server
 * component friendly, no client JS needed): submitting re-navigates to the
 * same report page with ?year=&term=, which the page re-reads and
 * re-filters server-side. `extraParams` re-attaches any other query params
 * the page already uses (e.g. `sort`) so they survive the filter submit. */
export function ReportYearTermFilter({
  action,
  years,
  terms,
  selectedYear,
  selectedTerm,
  extraParams = {},
}: {
  action: string;
  years: number[];
  terms: number[];
  selectedYear?: number;
  selectedTerm?: number;
  extraParams?: Record<string, string>;
}) {
  const hasActiveFilter = selectedYear !== undefined || selectedTerm !== undefined;

  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
      {Object.entries(extraParams).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div>
        <label htmlFor="year" className="mb-1 block text-xs font-semibold text-slate-600">
          Year
        </label>
        <select
          id="year"
          name="year"
          defaultValue={selectedYear !== undefined ? String(selectedYear) : ""}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
        >
          <option value="">All</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="term" className="mb-1 block text-xs font-semibold text-slate-600">
          Term
        </label>
        <select
          id="term"
          name="term"
          defaultValue={selectedTerm !== undefined ? String(selectedTerm) : ""}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
        >
          <option value="">All</option>
          {terms.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
      >
        Apply
      </button>
      {hasActiveFilter && (
        <a href={action} className="text-xs font-semibold text-slate-600 underline hover:text-slate-900">
          Clear
        </a>
      )}
    </form>
  );
}
