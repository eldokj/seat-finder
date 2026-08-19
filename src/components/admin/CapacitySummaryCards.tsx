import type { CapacityBreakdown } from "@/lib/validation/room-layout";

const STATS: { key: keyof CapacityBreakdown; label: string; tone: string }[] = [
  { key: "physicalPositions", label: "Physical Positions", tone: "text-slate-900" },
  { key: "gaps", label: "Gaps", tone: "text-slate-500" },
  { key: "disabled", label: "Disabled", tone: "text-red-700" },
  { key: "availableGridSeats", label: "Available Grid Seats", tone: "text-green-700" },
  { key: "additionalSeats", label: "Additional Seats", tone: "text-blue-700" },
  { key: "finalUsableCapacity", label: "Final Usable Capacity", tone: "text-purple-700" },
];

/**
 * The six-value capacity breakdown (Phase 6 Room Layout). Reused as-is by
 * both the live editor (recalculated on every click, before save) and the
 * read-only room detail preview (computed from the saved room_seats rows).
 */
export function CapacitySummaryCards({ breakdown }: { breakdown: CapacityBreakdown }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {STATS.map((stat) => (
        <div key={stat.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
          <p className={`text-xl font-bold tabular-nums ${stat.tone}`}>{breakdown[stat.key]}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
