"use client";

import { useMemo, useState } from "react";

export interface PreviewRow {
  rowNumber: number;
  severity: "valid" | "warning" | "error";
  classification: "added" | "updated" | "unchanged" | "rejected";
  messages: string[];
  /** Ordered label→value pairs to render as this row's cells. */
  fields: { label: string; value: string }[];
}

type FilterKey = "all" | "valid" | "warning" | "error" | "duplicate";

const PAGE_SIZE = 50;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "valid", label: "Valid" },
  { key: "warning", label: "Warning" },
  { key: "error", label: "Error" },
  { key: "duplicate", label: "Duplicate" },
];

export function ImportPreviewTable({ rows }: { rows: PreviewRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = rows;
    if (filter === "valid") result = result.filter((r) => r.severity === "valid");
    else if (filter === "warning") result = result.filter((r) => r.severity === "warning");
    else if (filter === "error") result = result.filter((r) => r.severity === "error");
    else if (filter === "duplicate")
      result = result.filter((r) => r.messages.some((m) => /duplicate/i.test(m)));

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((r) => {
        const haystack = [
          String(r.rowNumber),
          ...r.fields.map((f) => f.value),
          ...r.messages,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    return result;
  }, [rows, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const fieldLabels = rows[0]?.fields.map((f) => f.label) ?? [];

  function handleFilterChange(next: FilterKey) {
    setFilter(next);
    setPage(0);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(0);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => handleFilterChange(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === f.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search rows…"
          aria-label="Search import rows"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <p className="mb-2 text-xs text-slate-500">
        Showing {pageRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1}–
        {currentPage * PAGE_SIZE + pageRows.length} of {filtered.length} row(s)
        {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Status</th>
              {fieldLabels.map((label) => (
                <th key={label} className="px-3 py-2">
                  {label}
                </th>
              ))}
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row) => (
              <tr key={row.rowNumber}>
                <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                <td className="px-3 py-2">
                  <SeverityChip severity={row.severity} />
                </td>
                {row.fields.map((field) => (
                  <td key={field.label} className="max-w-[220px] truncate px-3 py-2" title={field.value}>
                    {field.value}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <ClassificationChip classification={row.classification} />
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-slate-500">
                  {row.messages.length > 0 ? row.messages.join(" ") : "—"}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={fieldLabels.length + 4} className="px-3 py-8 text-center text-sm text-slate-400">
                  No rows match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={currentPage >= pageCount - 1}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function SeverityChip({ severity }: { severity: PreviewRow["severity"] }) {
  const styles: Record<PreviewRow["severity"], string> = {
    valid: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${styles[severity]}`}>
      {severity}
    </span>
  );
}

function ClassificationChip({ classification }: { classification: PreviewRow["classification"] }) {
  const styles: Record<PreviewRow["classification"], string> = {
    added: "bg-blue-100 text-blue-800",
    updated: "bg-purple-100 text-purple-800",
    unchanged: "bg-slate-100 text-slate-600",
    rejected: "bg-red-50 text-red-700",
  };
  const labels: Record<PreviewRow["classification"], string> = {
    added: "Added",
    updated: "Updated",
    unchanged: "Unchanged",
    rejected: "Rejected",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[classification]}`}>
      {labels[classification]}
    </span>
  );
}
