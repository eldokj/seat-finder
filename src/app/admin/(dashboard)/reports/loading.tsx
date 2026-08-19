/** Phase 10 — covers the whole Reports segment (index + every nested
 * report), since these routes do the heaviest multi-table joins in the
 * admin portal. `role="status"` + the sr-only text so a screen reader
 * announces "Loading" immediately — the skeleton bars below are purely
 * decorative otherwise and would announce nothing at all. */
export default function ReportsLoading() {
  return (
    <div role="status" className="animate-pulse space-y-4">
      <span className="sr-only">Loading reports…</span>
      <div className="h-8 w-48 rounded bg-slate-200" />
      <div className="h-4 w-72 rounded bg-slate-100" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
