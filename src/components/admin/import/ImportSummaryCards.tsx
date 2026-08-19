export interface ImportSummaryLike {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  added: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

const STATS: { key: keyof ImportSummaryLike; label: string; tone: string }[] = [
  { key: "totalRows", label: "Total Rows", tone: "text-slate-900" },
  { key: "valid", label: "Valid", tone: "text-green-700" },
  { key: "warnings", label: "Warnings", tone: "text-amber-700" },
  { key: "errors", label: "Errors", tone: "text-red-700" },
  { key: "added", label: "Added", tone: "text-blue-700" },
  { key: "updated", label: "Updated", tone: "text-purple-700" },
  { key: "unchanged", label: "Unchanged", tone: "text-slate-500" },
  { key: "rejected", label: "Rejected", tone: "text-red-700" },
];

export function ImportSummaryCards({ summary }: { summary: ImportSummaryLike }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STATS.map((stat) => (
        <div key={stat.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
          <p className={`text-xl font-bold tabular-nums ${stat.tone}`}>{summary[stat.key]}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
