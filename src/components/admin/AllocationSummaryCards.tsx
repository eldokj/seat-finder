export interface AllocationSummary {
  participants: number;
  unallocated: number;
  compliant: number;
  violation: number;
  additionalUsed: number;
}

const STATS: { key: keyof AllocationSummary; label: string; tone: string }[] = [
  { key: "participants", label: "Participants", tone: "text-slate-900" },
  { key: "unallocated", label: "Unallocated", tone: "text-red-700" },
  { key: "compliant", label: "Rule Compliant", tone: "text-green-700" },
  { key: "violation", label: "Rule Violation", tone: "text-amber-700" },
  { key: "additionalUsed", label: "Additional-Seat Placements", tone: "text-blue-700" },
];

/** Same visual family as Phase 6's CapacitySummaryCards, for consistency. */
export function AllocationSummaryCards({ summary }: { summary: AllocationSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STATS.map((stat) => (
        <div key={stat.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
          <p className={`text-xl font-bold tabular-nums ${stat.tone}`}>{summary[stat.key]}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
