/** Phase 10 — the Seating Workspace loads the heaviest set of joined
 * queries in the admin portal (rooms + room_seats + seat_allocations +
 * students + master_timetable_records + resolved rules). `role="status"` +
 * the sr-only text so a screen reader announces "Loading" immediately. */
export default function SeatingWorkspaceLoading() {
  return (
    <div role="status" className="animate-pulse space-y-4">
      <span className="sr-only">Loading seating workspace…</span>
      <div className="h-8 w-72 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-100" />
    </div>
  );
}
