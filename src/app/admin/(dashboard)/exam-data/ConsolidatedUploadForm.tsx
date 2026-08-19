"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  previewConsolidatedImportAction,
  importConsolidatedImportAction,
  type ConsolidatedPreviewState,
} from "./actions";
import { ImportSummaryCards } from "@/components/admin/import/ImportSummaryCards";
import { ImportPreviewTable, type PreviewRow } from "@/components/admin/import/ImportPreviewTable";
import type { ConsolidatedImportRowResult, ConsolidatedCourseGroup } from "@/lib/validation/consolidated-import";
import { formatLongDate } from "@/lib/utils/date";

interface ImportSuccess {
  periodId: string;
  sessionsCreated: number;
  sessionsReused: number;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  rejectedCount: number;
}

interface PeriodOption {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface ConsolidatedUploadFormProps {
  periods: PeriodOption[];
  initialPeriodId?: string;
}

export function ConsolidatedUploadForm({ periods, initialPeriodId }: ConsolidatedUploadFormProps) {
  const [periodId, setPeriodId] = useState(initialPeriodId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ConsolidatedPreviewState | null>(null);
  const [importResult, setImportResult] = useState<ImportSuccess | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPeriod = periods.find((p) => p.id === periodId);

  function buildFormData(): FormData | null {
    if (!periodId || !file) return null;
    const formData = new FormData();
    formData.append("periodId", periodId);
    formData.append("file", file);
    return formData;
  }

  function handlePreview() {
    const formData = buildFormData();
    if (!formData) {
      setPreview({ ok: false, error: "Select an examination period and a file first." });
      return;
    }
    setImportResult(null);
    startTransition(async () => {
      const result = await previewConsolidatedImportAction(formData);
      setPreview(result);
    });
  }

  function handleConfirm() {
    const formData = buildFormData();
    if (!formData || !preview?.ok || !preview.result) return;

    const s = preview.result.summary;
    const confirmed = window.confirm(
      `You are about to import ${s.added + s.updated} student registration(s) across ${preview.sessionCount ?? 0} Daily Exam Session(s).\n\n` +
        `Added: ${s.added}\nUpdated: ${s.updated}\nUnchanged: ${s.unchanged}\nRejected: ${s.rejected}\nWarnings: ${s.warnings}\n\n` +
        `Continue?`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await importConsolidatedImportAction(formData);
      if (result.ok && result.periodId && result.summary) {
        setImportResult({
          periodId: result.periodId,
          sessionsCreated: result.sessionsCreated ?? 0,
          sessionsReused: result.sessionsReused ?? 0,
          addedCount: result.summary.added,
          updatedCount: result.summary.updated,
          unchangedCount: result.summary.unchanged,
          rejectedCount: result.summary.rejected,
        });
        setPreview(null);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setPreview({ ok: false, error: result.error ?? "Import failed. Please try again." });
      }
    });
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setImportResult(null);
  }

  const previewRows: PreviewRow[] | null =
    preview?.ok && preview.result ? preview.result.rows.map(toPreviewRow) : null;

  return (
    <div>
      {importResult && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-900">Import complete.</p>
          <p className="mt-1 text-sm text-green-800">
            {importResult.sessionsCreated} Daily Exam Session(s) created, {importResult.sessionsReused} reused.
            Added {importResult.addedCount}, updated {importResult.updatedCount}, unchanged{" "}
            {importResult.unchangedCount}, rejected {importResult.rejectedCount}.
          </p>
          <Link
            href={`/admin/examination-periods/${importResult.periodId}`}
            className="mt-3 inline-block text-sm font-semibold text-green-900 underline"
          >
            View examination period →
          </Link>
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Upload Excel</h2>
          <a
            href="/api/admin/exam-data/template"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Download Template
          </a>
        </div>

        {periods.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No examination periods yet.{" "}
            <Link href="/admin/examination-periods/new" className="font-semibold underline">
              Create one first
            </Link>{" "}
            — every import belongs to an examination period.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="periodId" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Examination Period
              </label>
              <select
                id="periodId"
                value={periodId}
                onChange={(e) => {
                  setPeriodId(e.target.value);
                  setPreview(null);
                }}
                disabled={isPending}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Select examination period</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatLongDate(p.start_date)} – {formatLongDate(p.end_date)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="file" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Excel File
              </label>
              <input
                id="file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                disabled={isPending}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Expected columns: Date, Session, Year, Term, Programme, Department, Course Code, Course,
          Register No, Student Name, Gender (optional). Every row&apos;s Date must fall within the
          selected period. Year is the academic/admission batch year (e.g. 2024); Term is the
          academic term/semester number (e.g. 1-6) — both required, and together with Programme +
          Course Code they identify one course. Strength is calculated automatically — do not
          include it. Renamed/reordered columns are matched automatically.
        </p>

        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending || !periodId || !file}
          className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isPending && !preview ? "Reading file…" : "Preview Import"}
        </button>
      </div>

      {preview && !preview.ok && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {preview.error}
        </p>
      )}

      {preview?.ok && preview.result && (
        <div className="mt-6">
          <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <strong>{selectedPeriod?.name}</strong> — this file will create or reuse{" "}
            <strong>{preview.sessionCount}</strong> Daily Exam Session(s), one per unique Date + Session
            found in the sheet.
          </div>

          <ImportSummaryCards summary={preview.result.summary} />

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Courses (Strength auto-calculated)</h3>
            <CourseGroupTable groups={preview.result.courseGroups} />
          </div>

          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Student rows</h3>
            <ImportPreviewTable rows={previewRows!} />
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="mt-5 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-300"
          >
            {isPending ? "Importing…" : "Confirm Import"}
          </button>
        </div>
      )}
    </div>
  );
}

function CourseGroupTable({ groups }: { groups: ConsolidatedCourseGroup[] }) {
  if (groups.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No valid course groups found in this file.</p>;
  }

  const styles: Record<ConsolidatedCourseGroup["classification"], string> = {
    added: "bg-blue-100 text-blue-800",
    updated: "bg-purple-100 text-purple-800",
    unchanged: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Session</th>
            <th className="px-3 py-2">Year</th>
            <th className="px-3 py-2">Term</th>
            <th className="px-3 py-2">Programme</th>
            <th className="px-3 py-2">Course Code</th>
            <th className="px-3 py-2">Course</th>
            <th className="px-3 py-2">Strength</th>
            <th className="px-3 py-2">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g) => (
            <tr key={`${g.examDate}-${g.session}-${g.programme}-${g.courseCode}-${g.year}-${g.term}`}>
              <td className="px-3 py-2">{g.examDate}</td>
              <td className="px-3 py-2">{g.session}</td>
              <td className="px-3 py-2 tabular-nums">{g.year}</td>
              <td className="px-3 py-2 tabular-nums">{g.term}</td>
              <td className="px-3 py-2">{g.programme}</td>
              <td className="px-3 py-2">{g.courseCode}</td>
              <td className="max-w-[220px] truncate px-3 py-2" title={g.courseName}>
                {g.courseName}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {g.computedStrength}
                {g.existingStrength != null && g.existingStrength !== g.computedStrength && (
                  <span className="ml-1 text-xs text-slate-400">(was {g.existingStrength})</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[g.classification]}`}>
                  {g.classification === "added" ? "Added" : g.classification === "updated" ? "Updated" : "Unchanged"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toPreviewRow(row: ConsolidatedImportRowResult): PreviewRow {
  const n = row.normalized;
  return {
    rowNumber: row.rowNumber,
    severity: row.severity,
    classification: row.classification,
    messages: row.messages,
    fields: [
      { label: "Date", value: n?.examDate ?? String(row.raw.date ?? "") },
      { label: "Session", value: n?.session ?? String(row.raw.session ?? "") },
      { label: "Year", value: n ? String(n.year) : String(row.raw.year ?? "") },
      { label: "Term", value: n ? String(n.term) : String(row.raw.term ?? "") },
      { label: "Programme", value: n?.programme ?? String(row.raw.programme ?? "") },
      { label: "Department", value: n?.department ?? String(row.raw.department ?? "") },
      { label: "Course", value: n?.courseName ?? String(row.raw.course ?? "") },
      { label: "Course Code", value: n?.courseCode ?? String(row.raw.courseCode ?? "") },
      { label: "Register No", value: n?.registerNo ?? String(row.raw.registerNumber ?? "") },
      { label: "Student Name", value: n?.studentName ?? String(row.raw.studentName ?? "") },
      { label: "Gender", value: n ? (n.gender ?? "—") : String(row.raw.gender ?? "") || "—" },
    ],
  };
}
