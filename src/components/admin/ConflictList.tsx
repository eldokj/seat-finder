import type { SeatingCell } from "@/lib/admin/seating-data-io";

interface ConflictListProps {
  violatingCells: SeatingCell[];
  roomLabel: Map<string, string>;
  onJump: (roomSeatId: string) => void;
}

/** Lists every seat currently classified 'violation' (live — recomputed on
 * every render, same as the rest of the workspace). Clicking a row asks the
 * parent to scroll to and highlight that seat in the room grid below. */
export function ConflictList({ violatingCells, roomLabel, onJump }: ConflictListProps) {
  if (violatingCells.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-800">Rule Violations ({violatingCells.length})</h2>
      <ul className="divide-y divide-amber-200">
        {violatingCells.map((cell) => (
          <li key={cell.roomSeatId}>
            <button
              type="button"
              onClick={() => onJump(cell.roomSeatId)}
              className="flex w-full items-start justify-between gap-3 rounded px-2 py-2 text-left text-sm transition hover:bg-amber-100"
            >
              <span>
                <span className="font-semibold text-slate-900">{cell.occupant?.registerNo}</span>{" "}
                <span className="text-slate-500">
                  — {roomLabel.get(cell.roomId) ?? cell.roomId} · {cell.seatLabel ?? `R${cell.rowNumber}C${cell.columnNumber}`}
                </span>
                {cell.occupant && cell.occupant.violationMessages.length > 0 && (
                  <span className="block text-xs text-amber-700">{cell.occupant.violationMessages.join(" ")}</span>
                )}
              </span>
              <span className="shrink-0 text-xs font-semibold text-blue-700">Jump →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
