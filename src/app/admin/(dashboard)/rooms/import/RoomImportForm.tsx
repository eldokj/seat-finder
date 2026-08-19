"use client";

import { useRef, useState, useTransition } from "react";
import { previewRoomImportAction, importRoomImportAction, type RoomImportPreviewState } from "./actions";
import { ImportSummaryCards } from "@/components/admin/import/ImportSummaryCards";
import { ImportPreviewTable, type PreviewRow } from "@/components/admin/import/ImportPreviewTable";
import type { RoomImportRowResult } from "@/lib/validation/room-import";

interface ImportSuccess {
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  rejectedCount: number;
}

export function RoomImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RoomImportPreviewState | null>(null);
  const [importResult, setImportResult] = useState<ImportSuccess | null>(null);
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
    setImportResult(null);
    startTransition(async () => {
      const result = await previewRoomImportAction(formData);
      setPreview(result);
    });
  }

  function handleConfirm() {
    const formData = buildFormData();
    if (!formData || !preview?.ok || !preview.result) return;

    const s = preview.result.summary;
    const confirmed = window.confirm(
      `You are about to import ${s.added + s.updated} room(s).\n\n` +
        `Added: ${s.added}\nUpdated: ${s.updated}\nUnchanged: ${s.unchanged}\nRejected: ${s.rejected}\nWarnings: ${s.warnings}\n\n` +
        `Continue?`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await importRoomImportAction(formData);
      if (result.ok && result.summary) {
        setImportResult({
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
            Added {importResult.addedCount}, updated {importResult.updatedCount}, unchanged{" "}
            {importResult.unchangedCount}, rejected {importResult.rejectedCount}.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Upload Excel</h2>
          <a
            href="/api/admin/rooms/template"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Download Template
          </a>
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
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Expected columns: Room Number, Code, Block, Floor, Landmark, Rows, Columns, Additional Seats,
          Status. Code must be unique — matched against existing rooms to decide add vs. update. Rows and
          Columns are required only when creating a brand-new room; for an existing room they&apos;re
          optional and ignored entirely once a layout has been saved.
        </p>

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

      {preview?.ok && preview.result && (
        <div className="mt-6">
          <ImportSummaryCards summary={preview.result.summary} />

          <div className="mt-5">
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

function toPreviewRow(row: RoomImportRowResult): PreviewRow {
  const n = row.normalized;
  return {
    rowNumber: row.rowNumber,
    severity: row.severity,
    classification: row.classification,
    messages: row.messages,
    fields: [
      { label: "Room Number", value: n?.roomNumber ?? String(row.raw.roomNumber ?? "") },
      { label: "Code", value: n?.code ?? String(row.raw.code ?? "") },
      { label: "Block", value: n?.block ?? "—" },
      { label: "Floor", value: n?.floor ?? "—" },
      { label: "Rows", value: n?.rows != null ? String(n.rows) : "—" },
      { label: "Columns", value: n?.columns != null ? String(n.columns) : "—" },
      { label: "Additional Seats", value: n ? String(n.additionalSeats) : "—" },
      { label: "Status", value: n?.status ?? "—" },
    ],
  };
}
