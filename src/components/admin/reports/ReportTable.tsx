import type { SeatedRow } from "@/lib/validation/reports";

export interface ReportColumn {
  key: keyof SeatedRow | "srNo";
  label: string;
}

const DEFAULT_COLUMNS: ReportColumn[] = [
  { key: "srNo", label: "Sr." },
  { key: "registerNo", label: "Register No" },
  { key: "studentName", label: "Student Name" },
  { key: "programme", label: "Programme" },
  { key: "courseCode", label: "Course" },
  { key: "year", label: "Year" },
  { key: "term", label: "Term" },
  { key: "roomNumber", label: "Room" },
  { key: "seatLabel", label: "Seat" },
];

/** Flat (ungrouped) seated-row table — Date/Session-wise and Student-wise
 * reports both use this directly. */
export function ReportTable({ rows, columns = DEFAULT_COLUMNS }: { rows: SeatedRow[]; columns?: ReportColumn[] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No seated students to show.</p>;
  }
  return (
    // Phase 10: without a min-width + scrollable wrapper, this 7-column
    // table just compressed uncontrollably on a phone screen (columns
    // squeezed to a few px each) instead of scrolling — print output is
    // unaffected, since print pagination ignores screen overflow behavior.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-slate-800">
            {columns.map((col) => (
              <th key={col.key} className="px-2 py-2 font-semibold text-slate-700">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.seatAllocationId} className="border-b border-slate-200">
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-1.5 text-slate-800">
                  {col.key === "srNo" ? idx + 1 : (row[col.key as keyof SeatedRow] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Grouped variant (Programme-wise / Course-wise) — one sub-table per
 * group, a subtotal line, page-break-friendly section headers. */
export function GroupedReportTable({
  groups,
  groupLabel,
  columns = DEFAULT_COLUMNS.filter((c) => c.key !== "programme" && c.key !== "courseCode"),
}: {
  groups: { groupKey: string; rows: SeatedRow[] }[];
  groupLabel: string;
  columns?: ReportColumn[];
}) {
  if (groups.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No seated students to show.</p>;
  }
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.groupKey} className="break-inside-avoid">
          <h3 className="mb-2 border-b border-slate-400 pb-1 text-sm font-bold uppercase tracking-wide text-slate-800">
            {groupLabel}: {group.groupKey} <span className="font-normal normal-case text-slate-500">({group.rows.length} student{group.rows.length === 1 ? "" : "s"})</span>
          </h3>
          <ReportTable rows={group.rows} columns={columns} />
        </div>
      ))}
    </div>
  );
}
