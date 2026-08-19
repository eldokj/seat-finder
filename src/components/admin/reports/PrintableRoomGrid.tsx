import type { SeatingCell, AdditionalSlot } from "@/lib/admin/seating-data-io";

/**
 * Phase 9 — read-only, print-optimized room grid for the Room-wise Seating
 * Arrangement report. A deliberately SEPARATE component from Phase 6's
 * interactive RoomLayoutEditor and Phase 7's interactive SeatingWorkspace
 * grid — no click handlers, no state, just a faithful rendering of the
 * actual saved layout (rows/columns/seat labels/gaps/disabled/occupants),
 * reusing their existing `SeatingCell`/`AdditionalSlot` types rather than
 * redefining the shape.
 */

const CELL_STYLE: Record<string, string> = {
  gap: "border-dashed border-slate-300 bg-transparent text-slate-300",
  disabled: "border-slate-400 bg-slate-200 text-slate-500",
  empty: "border-slate-300 bg-white text-slate-400",
  occupied: "border-slate-600 bg-slate-50 text-slate-900 font-semibold",
};

export function PrintableRoomGrid({ cells, additionalSlots }: { cells: SeatingCell[]; additionalSlots: AdditionalSlot[] }) {
  if (cells.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">This room has no drawn layout.</p>;
  }

  const rows = Math.max(...cells.map((c) => c.rowNumber));
  const columns = Math.max(...cells.map((c) => c.columnNumber));
  const byKey = new Map(cells.map((c) => [`${c.rowNumber}-${c.columnNumber}`, c]));

  return (
    <div>
      {/* Phase 10: a wide room's grid (many columns x h-12 w-16 cells) can
       * easily exceed a phone's viewport width — this wrapper scrolls the
       * grid horizontally instead of overflowing the whole page. */}
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {Array.from({ length: rows }, (_, rIdx) => (
            <div key={rIdx} className="flex gap-1">
              {Array.from({ length: columns }, (_, cIdx) => {
                const cell = byKey.get(`${rIdx + 1}-${cIdx + 1}`);
                if (!cell) return null;
                const style = cell.cellState === "gap" ? CELL_STYLE.gap : cell.cellState === "disabled" ? CELL_STYLE.disabled : cell.occupant ? CELL_STYLE.occupied : CELL_STYLE.empty;
                return (
                  <div key={cell.roomSeatId} title={cell.occupant ? `${cell.occupant.registerNo} — ${cell.occupant.fullName}` : (cell.seatLabel ?? undefined)} className={`flex h-12 w-16 flex-none flex-col items-center justify-center rounded border text-[10px] leading-tight ${style}`}>
                    {cell.cellState === "gap" ? (
                      <span aria-hidden="true">—</span>
                    ) : (
                      <>
                        <span className="text-[9px] text-slate-500">{cell.seatLabel}</span>
                        <span className="max-w-full truncate px-0.5">{cell.occupant ? cell.occupant.registerNo : cell.cellState === "disabled" ? "Disabled" : "Empty"}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
        <Legend swatch={CELL_STYLE.occupied} label="Occupied" />
        <Legend swatch={CELL_STYLE.empty} label="Empty / Available" />
        <Legend swatch={CELL_STYLE.disabled} label="Disabled" />
        <Legend swatch={CELL_STYLE.gap} label="Gap" />
      </div>

      {additionalSlots.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Additional Seats</p>
          <div className="flex flex-wrap gap-2">
            {additionalSlots.map((slot) => (
              <div key={slot.seatNo} className={`rounded border px-2.5 py-1 text-[11px] ${slot.occupant ? CELL_STYLE.occupied : CELL_STYLE.empty}`}>
                {slot.seatNo}: {slot.occupant ? slot.occupant.registerNo : "Empty"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm border ${swatch}`} />
      {label}
    </span>
  );
}
