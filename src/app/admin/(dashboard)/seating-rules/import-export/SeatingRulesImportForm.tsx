"use client";

import { useRef, useState, useTransition } from "react";
import {
  previewSeatingRulesImportAction,
  importSeatingRulesImportAction,
  type SeatingRulesImportPreviewState,
} from "./actions";
import type { SeatingRuleSetInput } from "@/lib/validation/seating-rule";

export function SeatingRulesImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SeatingRulesImportPreviewState | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function buildFormData(): FormData | null {
    if (!file) return null;
    const formData = new FormData();
    formData.append("file", file);
    return formData;
  }

  function handlePreview() {
    const formData = buildFormData();
    if (!formData) {
      setPreview({ ok: false, error: "Choose a file first." });
      return;
    }
    setSuccess(false);
    startTransition(async () => {
      const result = await previewSeatingRulesImportAction(formData);
      setPreview(result);
    });
  }

  function handleConfirm() {
    const formData = buildFormData();
    if (!formData || !preview?.ok) return;

    const confirmed = window.confirm(
      "This replaces the current global seating rules with the imported ones. Continue?"
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await importSeatingRulesImportAction(formData);
      if (result.ok) {
        setSuccess(true);
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
    setSuccess(false);
  }

  return (
    <div>
      {success && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-900">Import complete.</p>
          <p className="mt-1 text-sm text-green-800">The global seating rules have been replaced.</p>
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Upload JSON</h2>

        <div>
          <label htmlFor="file" className="mb-1.5 block text-sm font-semibold text-slate-700">
            JSON File
          </label>
          <input
            id="file"
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            disabled={isPending}
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending || !file}
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

      {preview?.ok && preview.parsed && preview.current && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Current vs. Importing</h3>
          <RuleSetComparison current={preview.current} incoming={preview.parsed} />

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

function summarizeRuleSet(input: SeatingRuleSetInput): { label: string; value: string }[] {
  return [
    { label: "Allocation Pattern", value: input.allocation_pattern },
    {
      label: "Row Jump",
      value: input.row_jump.enabled
        ? `On — gap ${input.row_jump.gap ?? "—"}, group by ${(input.row_jump.group_by ?? []).join(", ") || "—"}`
        : "Off",
    },
    {
      label: "Column Jump",
      value: input.column_jump.enabled
        ? `On — gap ${input.column_jump.gap ?? "—"}, group by ${(input.column_jump.group_by ?? []).join(", ") || "—"}`
        : "Off",
    },
    { label: "Avoid Same Programme Adjacent", value: input.avoid_same_programme_adjacent ? "On" : "Off" },
    { label: "Avoid Same Department Adjacent", value: input.avoid_same_department_adjacent ? "On" : "Off" },
    { label: "Avoid Same Course Adjacent", value: input.avoid_same_course_adjacent ? "On" : "Off" },
  ];
}

function RuleSetComparison({ current, incoming }: { current: SeatingRuleSetInput; incoming: SeatingRuleSetInput }) {
  const currentRows = summarizeRuleSet(current);
  const incomingRows = summarizeRuleSet(incoming);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Setting</th>
            <th className="px-3 py-2">Current</th>
            <th className="px-3 py-2">Importing</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {currentRows.map((row, i) => {
            const changed = row.value !== incomingRows[i].value;
            return (
              <tr key={row.label} className={changed ? "bg-amber-50" : undefined}>
                <td className="px-3 py-2 font-medium text-slate-700">{row.label}</td>
                <td className="px-3 py-2 text-slate-500">{row.value}</td>
                <td className={`px-3 py-2 ${changed ? "font-semibold text-amber-800" : "text-slate-500"}`}>
                  {incomingRows[i].value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
