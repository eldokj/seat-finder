"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TextField, SelectField } from "@/components/admin/form-fields";
import { CapacitySummaryCards } from "@/components/admin/CapacitySummaryCards";
import { ErrorBanner } from "@/components/admin/ErrorBanner";
import {
  mergeGrid,
  computeCapacityBreakdown,
  validateGrid,
  cellAccessibleLabel,
  type SeatCell,
  type SeatCellState,
} from "@/lib/validation/room-layout";
import type { Room, RoomSeat, SeatPattern } from "@/types/database";
import type { RoomLayoutSaveResult } from "@/app/admin/(dashboard)/rooms/[id]/layout/actions";

const PATTERN_OPTIONS: { value: SeatPattern; label: string }[] = [
  { value: "row_wise", label: "Row-wise" },
  { value: "column_wise", label: "Column-wise" },
  { value: "serpentine_row", label: "Serpentine (row)" },
  { value: "serpentine_column", label: "Serpentine (column)" },
  { value: "custom", label: "Custom" },
];

const STATE_STYLES: Record<SeatCellState, string> = {
  available: "border-green-300 bg-green-100 text-green-900 hover:bg-green-200",
  disabled: "border-slate-400 bg-slate-300 text-slate-700 hover:bg-slate-400",
  gap: "border-dashed border-slate-300 bg-transparent text-slate-300 hover:bg-slate-50",
};

function cellsFromDb(rows: RoomSeat[]): SeatCell[] {
  return rows.map((row) => ({
    row_number: row.row_number,
    column_number: row.column_number,
    seat_label: row.seat_label ?? "",
    state: row.position_type === "gap" ? "gap" : row.status === "disabled" ? "disabled" : "available",
  }));
}

interface RoomLayoutEditorProps {
  room: Room;
  initialSeats: RoomSeat[];
  saveAction: (
    roomId: string,
    input: {
      rows: number;
      columns: number;
      additional_seats: number;
      numbering_scheme: SeatPattern;
      seats: { row_number: number; column_number: number; seat_label: string; state: SeatCellState }[];
    }
  ) => Promise<RoomLayoutSaveResult>;
}

export function RoomLayoutEditor({ room, initialSeats, saveAction }: RoomLayoutEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rowsInput, setRowsInput] = useState(room.rows != null ? String(room.rows) : "");
  const [columnsInput, setColumnsInput] = useState(room.columns != null ? String(room.columns) : "");
  const [additionalInput, setAdditionalInput] = useState(String(room.additional_seats ?? 0));
  const [pattern, setPattern] = useState<SeatPattern>(room.numbering_scheme ?? "row_wise");

  const [gridRows, setGridRows] = useState(room.rows ?? 0);
  const [gridColumns, setGridColumns] = useState(room.columns ?? 0);
  const [cells, setCells] = useState<SeatCell[]>(() => cellsFromDb(initialSeats));

  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null);
  const [editingLabelMode, setEditingLabelMode] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

  const cellMap = useMemo(() => {
    const map = new Map<string, SeatCell>();
    for (const cell of cells) map.set(`${cell.row_number}-${cell.column_number}`, cell);
    return map;
  }, [cells]);

  const additionalSeats = Math.max(0, parseInt(additionalInput, 10) || 0);
  const breakdown = useMemo(() => computeCapacityBreakdown(cells, additionalSeats), [cells, additionalSeats]);

  const selectedCell = selected ? (cellMap.get(`${selected.row}-${selected.column}`) ?? null) : null;

  function handleGenerate() {
    const rows = parseInt(rowsInput, 10);
    const columns = parseInt(columnsInput, 10);
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
      setFormError("Enter a valid number of rows and columns (1 or more) first.");
      return;
    }

    if (cells.length > 0) {
      const confirmed = window.confirm(
        "Regenerate the grid? Seat labels recalculate for the chosen numbering pattern (custom labels on existing seats are kept). Available/disabled/gap marks are kept wherever a seat's row and column still exist in the new size."
      );
      if (!confirmed) return;
    }

    setFormError(null);
    setSelected(null);
    setGridRows(rows);
    setGridColumns(columns);
    setCells(mergeGrid(cells, rows, columns, pattern));
  }

  function handleCellClick(row: number, column: number) {
    if (selected?.row === row && selected?.column === column) {
      setSelected(null);
      setEditingLabelMode(false);
      return;
    }
    setSelected({ row, column });
    setEditingLabelMode(false);
    setLabelError(null);
  }

  function setSelectedState(state: SeatCellState) {
    if (!selected) return;
    setCells((prev) =>
      prev.map((cell) =>
        cell.row_number === selected.row && cell.column_number === selected.column ? { ...cell, state } : cell
      )
    );
  }

  function startEditLabel() {
    if (!selectedCell) return;
    setLabelDraft(selectedCell.seat_label);
    setEditingLabelMode(true);
    setLabelError(null);
  }

  function applyLabel() {
    if (!selected) return;
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setLabelError("Enter a label.");
      return;
    }
    const duplicate = cells.some(
      (cell) =>
        cell.state !== "gap" &&
        !(cell.row_number === selected.row && cell.column_number === selected.column) &&
        cell.seat_label.trim() === trimmed
    );
    if (duplicate) {
      setLabelError(`Seat label "${trimmed}" is already used elsewhere in this room.`);
      return;
    }
    setCells((prev) =>
      prev.map((cell) =>
        cell.row_number === selected.row && cell.column_number === selected.column
          ? { ...cell, seat_label: trimmed }
          : cell
      )
    );
    setEditingLabelMode(false);
    setLabelError(null);
  }

  function handleSave() {
    setFormError(null);

    if (gridRows < 1 || gridColumns < 1 || cells.length === 0) {
      setFormError("Generate the grid before saving.");
      return;
    }

    const errors = validateGrid(cells, gridRows, gridColumns);
    if (errors.length > 0) {
      setFormError(errors[0]);
      return;
    }

    startTransition(async () => {
      const result = await saveAction(room.id, {
        rows: gridRows,
        columns: gridColumns,
        additional_seats: additionalSeats,
        numbering_scheme: pattern,
        seats: cells.map(({ row_number, column_number, seat_label, state }) => ({
          row_number,
          column_number,
          seat_label,
          state,
        })),
      });

      if (!result.success) {
        setFormError(result.error ?? "Unable to save the layout. Please try again.");
        return;
      }

      router.push(`/admin/rooms/${room.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Grid setup</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <TextField
            label="Rows"
            name="rows"
            type="number"
            min={1}
            value={rowsInput}
            onChange={(e) => setRowsInput(e.target.value)}
            disabled={isPending}
          />
          <TextField
            label="Columns"
            name="columns"
            type="number"
            min={1}
            value={columnsInput}
            onChange={(e) => setColumnsInput(e.target.value)}
            disabled={isPending}
          />
          <TextField
            label="Additional Seats"
            name="additional_seats"
            type="number"
            min={0}
            value={additionalInput}
            onChange={(e) => setAdditionalInput(e.target.value)}
            disabled={isPending}
          />
          <SelectField
            label="Numbering Pattern"
            name="numbering_scheme"
            value={pattern}
            onChange={(e) => setPattern(e.target.value as SeatPattern)}
            options={PATTERN_OPTIONS}
            disabled={isPending}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Total Physical Positions ={" "}
          <span className="font-semibold text-slate-600">
            {(parseInt(rowsInput, 10) || 0) * (parseInt(columnsInput, 10) || 0)}
          </span>{" "}
          (Rows × Columns, calculated automatically).
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {cells.length > 0 ? "Regenerate Grid" : "Generate Grid"}
        </button>
      </div>

      {formError && <ErrorBanner message={formError} />}

      <CapacitySummaryCards breakdown={breakdown} />

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Seat grid</h2>
          {cells.length > 0 && (
            <p className="text-xs text-slate-400">Click a seat to choose available, disabled, gap, or edit its label.</p>
          )}
        </div>

        {cells.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Enter rows and columns above, then Generate Grid to start.
          </p>
        ) : (
          <>
            {selected && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-slate-700">
                  Row {selected.row}, Column {selected.column}
                </span>

                {!editingLabelMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedState("available")}
                      className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"
                    >
                      Available
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedState("disabled")}
                      className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Disabled
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedState("gap")}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                    >
                      Gap
                    </button>
                    <button
                      type="button"
                      onClick={startEditLabel}
                      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                    >
                      Edit Label
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-600"
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={applyLabel}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLabelMode(false);
                        setLabelError(null);
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    {labelError && <span className="text-xs font-medium text-red-600">{labelError}</span>}
                  </>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <div className="inline-flex flex-col gap-1 pb-2">
                {Array.from({ length: gridRows }, (_, rIdx) => {
                  const row = rIdx + 1;
                  return (
                    <div key={row} className="flex gap-1">
                      {Array.from({ length: gridColumns }, (_, cIdx) => {
                        const column = cIdx + 1;
                        const cell = cellMap.get(`${row}-${column}`);
                        if (!cell) return null;
                        const isSelected = selected?.row === row && selected?.column === column;
                        return (
                          <button
                            type="button"
                            key={column}
                            onClick={() => handleCellClick(row, column)}
                            title={`Row ${row}, Column ${column}`}
                            aria-label={cellAccessibleLabel(cell)}
                            aria-pressed={isSelected}
                            className={`flex h-8 w-10 flex-none items-center justify-center rounded border text-[10px] font-semibold transition ${STATE_STYLES[cell.state]} ${
                              isSelected ? "ring-2 ring-slate-900 ring-offset-1" : ""
                            }`}
                          >
                            {cell.state === "gap" ? "" : cell.seat_label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-green-300 bg-green-100 align-middle" />
                Available
              </span>
              <span>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-slate-400 bg-slate-300 align-middle" />
                Disabled
              </span>
              <span>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-slate-300 align-middle" />
                Gap
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || cells.length === 0}
          className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isPending ? "Saving…" : "Save Layout"}
        </button>
      </div>
    </div>
  );
}
