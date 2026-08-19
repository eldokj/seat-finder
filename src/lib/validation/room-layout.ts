import { z } from "zod";
import type { SeatPattern, SeatPositionType, RoomSeatStatus } from "@/types/database";

/**
 * Phase 6 — Room Layout editor. Pure, I/O-free grid logic, unit-testable
 * without a live DB (see room-layout.test.ts), following the same
 * pure-logic/I-O split as the import pipelines
 * (validation/consolidated-import.ts and friends).
 *
 * The grid is always fully dynamic — `rows` and `columns` are whatever the
 * admin enters for THIS room (see docs example: M101 is 5 x 9, another room
 * is 8 x 9). Nothing here assumes or defaults to a fixed size.
 */

/**
 * Unified 3-state view of a grid cell used by the visual editor. Maps to
 * `room_seats.position_type` + `.status` on the way in/out of the DB — see
 * `cellStateFromDb` / `cellToDbShape`. Kept as one enum in the UI because
 * the click menu offers exactly these three placement states plus "Edit
 * Label" (which doesn't change state).
 */
export type SeatCellState = "available" | "disabled" | "gap";

export interface SeatCell {
  row_number: number;
  column_number: number;
  /** Always populated, even for `gap` cells — so a gap that's switched back
   * to a seat has a sensible label ready. Nulled out only when converting
   * to the DB shape (see `cellToDbShape`), matching the DB check constraint
   * that a gap never carries a label. */
  seat_label: string;
  state: SeatCellState;
}

export interface SeatCellDbShape {
  row_number: number;
  column_number: number;
  section: string | null;
  seat_label: string | null;
  position_type: SeatPositionType;
  status: RoomSeatStatus;
}

export const SEAT_PATTERNS = ["row_wise", "column_wise", "serpentine_row", "serpentine_column", "custom"] as const;

export const roomLayoutSetupSchema = z.object({
  rows: z.coerce
    .number("Rows must be a number.")
    .int("Rows must be a whole number.")
    .positive("Rows must be greater than zero."),
  columns: z.coerce
    .number("Columns must be a number.")
    .int("Columns must be a whole number.")
    .positive("Columns must be greater than zero."),
  additional_seats: z.coerce
    .number("Additional seats must be a number.")
    .int("Additional seats must be a whole number.")
    .nonnegative("Additional seats can't be negative.")
    .default(0),
  numbering_scheme: z.enum(SEAT_PATTERNS),
});

const seatCellSchema = z.object({
  row_number: z.number().int().positive(),
  column_number: z.number().int().positive(),
  seat_label: z.string(),
  state: z.enum(["available", "disabled", "gap"]),
});

export const roomLayoutSaveSchema = roomLayoutSetupSchema.extend({
  seats: z.array(seatCellSchema),
});

export type RoomLayoutSaveInput = z.infer<typeof roomLayoutSaveSchema>;

/**
 * The six-value capacity breakdown required alongside every layout:
 * Physical Positions = Gaps + Disabled + Available Grid Seats (always,
 * structurally — every cell is exactly one of the three), and Final Usable
 * Capacity = Available Grid Seats + Additional Seats. Nothing here is
 * stored directly except `finalUsableCapacity` (mirrored onto
 * `rooms.usable_seats`) and `physicalPositions` (mirrored onto
 * `rooms.total_physical_positions`) — the rest is always computed live.
 */
export interface CapacityBreakdown {
  physicalPositions: number;
  gaps: number;
  disabled: number;
  availableGridSeats: number;
  additionalSeats: number;
  finalUsableCapacity: number;
}

function labelNumber(row: number, column: number, rows: number, columns: number, pattern: SeatPattern): number {
  const r = row - 1;
  const c = column - 1;
  switch (pattern) {
    case "column_wise":
      return c * rows + r + 1;
    case "serpentine_row":
      return r % 2 === 0 ? r * columns + c + 1 : r * columns + (columns - 1 - c) + 1;
    case "serpentine_column":
      return c % 2 === 0 ? c * rows + r + 1 : c * rows + (rows - 1 - r) + 1;
    case "row_wise":
    case "custom":
    default:
      return r * columns + c + 1;
  }
}

/** Builds a fresh rows x columns grid (1-indexed), every cell available,
 * labeled per the chosen pattern. `rows`/`columns` are never defaulted or
 * capped here — whatever the admin passes in is what gets built. */
export function generateGrid(rows: number, columns: number, pattern: SeatPattern): SeatCell[] {
  const cells: SeatCell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= columns; column++) {
      cells.push({
        row_number: row,
        column_number: column,
        seat_label: String(labelNumber(row, column, rows, columns, pattern)),
        state: "available",
      });
    }
  }
  return cells;
}

/**
 * Rebuilds a grid at a new rows x columns x pattern, carrying over each
 * existing cell's available/disabled/gap state where its (row, column)
 * still exists in the new bounds. Labels are recomputed from the pattern,
 * except under 'custom' where a previously-existing cell keeps its
 * manually-set label — only brand-new cells (from growing the grid) get a
 * fresh sequential fallback label. Used both for the very first "Generate
 * Grid" (existing = []) and for resizing an already-edited grid.
 */
export function mergeGrid(existing: SeatCell[], rows: number, columns: number, pattern: SeatPattern): SeatCell[] {
  const byKey = new Map(existing.map((cell) => [`${cell.row_number}-${cell.column_number}`, cell]));
  const cells: SeatCell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= columns; column++) {
      const previous = byKey.get(`${row}-${column}`);
      const generatedLabel = String(labelNumber(row, column, rows, columns, pattern));
      cells.push({
        row_number: row,
        column_number: column,
        seat_label: previous && pattern === "custom" ? previous.seat_label : generatedLabel,
        state: previous?.state ?? "available",
      });
    }
  }
  return cells;
}

export function cellStateFromDb(positionType: SeatPositionType, status: RoomSeatStatus): SeatCellState {
  if (positionType === "gap") return "gap";
  return status === "disabled" ? "disabled" : "available";
}

/** Phase 10 accessibility fix: a grid cell button's visible text is just
 * its seat label (or nothing at all, for a gap) — the cell's actual state
 * (available/disabled/gap) is conveyed only by color, and previously only
 * by a mouse-hover `title` beyond that. A gap cell in particular rendered
 * with EMPTY visible text and no aria-label, so a screen reader announced
 * nothing but "button". This builds a full accessible name instead. */
export function cellAccessibleLabel(cell: Pick<SeatCell, "row_number" | "column_number" | "seat_label" | "state">): string {
  const position = `row ${cell.row_number}, column ${cell.column_number}`;
  if (cell.state === "gap") return `${position}, gap, not a seat`;
  const seatPart = cell.seat_label ? `seat ${cell.seat_label}` : "seat";
  return cell.state === "disabled" ? `${position}, ${seatPart}, disabled` : `${position}, ${seatPart}, available`;
}

/** Converts an editor cell to the shape `room_seats` expects, satisfying
 * the DB check constraint (`position_type = 'gap' OR seat_label IS NOT
 * NULL`) by construction. */
export function cellToDbShape(cell: Pick<SeatCell, "row_number" | "column_number" | "seat_label" | "state">): SeatCellDbShape {
  if (cell.state === "gap") {
    return {
      row_number: cell.row_number,
      column_number: cell.column_number,
      section: null,
      seat_label: null,
      position_type: "gap",
      status: "available",
    };
  }
  return {
    row_number: cell.row_number,
    column_number: cell.column_number,
    section: null,
    seat_label: cell.seat_label,
    position_type: "seat",
    status: cell.state === "disabled" ? "disabled" : "available",
  };
}

/**
 * Phase-1 write for the save action's two-phase upsert: every desired cell
 * is temporarily written as a labelless gap first, vacating the room's
 * `(room_id, seat_label)` unique-label space entirely before phase 2 writes
 * the real final labels.
 *
 * Without this, a single upsert that reassigns labels (e.g. switching
 * numbering pattern, which relabels the whole grid) can hit a transient
 * unique-constraint violation — one row's new label can momentarily equal
 * another row's not-yet-updated old label — even though the FINAL label set
 * is perfectly unique. Postgres checks a plain (non-deferrable) unique
 * index as each row of a multi-row upsert is applied, not once at the end
 * of the statement, so mid-batch collisions are real, not hypothetical
 * (confirmed live against the Supabase project during Phase 6 testing).
 */
export function cellToPlaceholderShape(cell: Pick<SeatCell, "row_number" | "column_number">): SeatCellDbShape {
  return {
    row_number: cell.row_number,
    column_number: cell.column_number,
    section: null,
    seat_label: null,
    position_type: "gap",
    status: "available",
  };
}

export function computeCapacityBreakdown(
  cells: Pick<SeatCell, "state">[],
  additionalSeats: number
): CapacityBreakdown {
  let gaps = 0;
  let disabled = 0;
  let availableGridSeats = 0;
  for (const cell of cells) {
    if (cell.state === "gap") gaps++;
    else if (cell.state === "disabled") disabled++;
    else availableGridSeats++;
  }
  return {
    physicalPositions: cells.length,
    gaps,
    disabled,
    availableGridSeats,
    additionalSeats,
    finalUsableCapacity: availableGridSeats + additionalSeats,
  };
}

/** Validates a fully-assembled grid before it's sent to the server (called
 * both client-side before Save and server-side for defense in depth).
 * Returns human-readable problems; empty means the grid is safe to save. */
export function validateGrid(cells: SeatCell[], rows: number, columns: number): string[] {
  const errors: string[] = [];

  if (cells.length !== rows * columns) {
    errors.push(`Expected ${rows * columns} cells (${rows} x ${columns}) but found ${cells.length}. Regenerate the grid.`);
  }

  const seen = new Set<string>();
  const labelCounts = new Map<string, number>();

  for (const cell of cells) {
    const key = `${cell.row_number}-${cell.column_number}`;
    if (seen.has(key)) {
      errors.push(`Duplicate cell at row ${cell.row_number}, column ${cell.column_number}.`);
    }
    seen.add(key);

    if (cell.row_number < 1 || cell.row_number > rows || cell.column_number < 1 || cell.column_number > columns) {
      errors.push(`Cell at row ${cell.row_number}, column ${cell.column_number} is outside the ${rows} x ${columns} grid.`);
    }

    if (cell.state !== "gap") {
      const label = cell.seat_label.trim();
      if (!label) {
        errors.push(`Seat at row ${cell.row_number}, column ${cell.column_number} needs a label.`);
      } else {
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }
    }
  }

  for (const [label, count] of labelCounts) {
    if (count > 1) errors.push(`Seat label "${label}" is used ${count} times — labels must be unique within the room.`);
  }

  return errors;
}

export interface ExistingRoomSeat {
  id: string;
  row_number: number;
  column_number: number;
}

/** Room_seats rows that exist in the DB but are no longer part of the
 * desired grid (a shrink in rows/columns, or a cell removed by resize) —
 * these are the ids the save action must delete, after checking none of
 * them are already referenced by a seat_allocations row. */
export function computeSeatsToDelete(
  existing: ExistingRoomSeat[],
  desired: Pick<SeatCell, "row_number" | "column_number">[]
): string[] {
  const desiredKeys = new Set(desired.map((cell) => `${cell.row_number}-${cell.column_number}`));
  return existing.filter((row) => !desiredKeys.has(`${row.row_number}-${row.column_number}`)).map((row) => row.id);
}
