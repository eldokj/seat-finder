import { normalizeText, normalizeInt } from "./import-normalize";
import type { RoomColumnKey } from "@/lib/excel/columns";
import type { RoomStatus } from "@/types/database";
import type { RowSeverity, RowClassification } from "./import-shared";

/**
 * Import/Export architecture (approved) — Room Master import. Rows/Columns
 * are informational only: used ONLY to estimate a brand-new room's starting
 * capacity (rows*columns + additionalSeats). They are NEVER written to
 * rooms.rows/rooms.columns and NEVER create/modify room_seats rows — actual
 * layout creation/modification stays exclusively in the Room Layout editor
 * / Room Layout import (see room-layout-import.ts). For a room that already
 * has a saved layout (`hasLayout`), Rows/Columns/capacity are left
 * completely untouched by this importer, even if present in the file — a
 * warning is surfaced instead of silently ignoring them.
 */

export interface NormalizedRoomImportRow {
  roomNumber: string;
  code: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
  rows: number | null;
  columns: number | null;
  additionalSeats: number;
  status: RoomStatus;
}

export interface RoomImportRowResult {
  rowNumber: number;
  raw: Record<RoomColumnKey, unknown>;
  normalized: NormalizedRoomImportRow | null;
  severity: RowSeverity;
  classification: RowClassification;
  messages: string[];
  /** The write this row will perform, resolved once classification is known
   * — null for a rejected row. Kept separate from `normalized` because it
   * depends on whether the matched existing room already has a layout. */
  plannedWrite: PlannedRoomWrite | null;
}

/** What's already on record for this room's Code, if anything. */
export interface ExistingRoomForImport {
  code: string;
  roomNumber: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
  additionalSeats: number;
  status: RoomStatus;
  usableSeats: number;
  /** True once a layout has been saved (rooms.rows is only ever set by the
   * Room Layout editor's save action — null means no layout yet). */
  hasLayout: boolean;
}

export type ExistingRoomsByCode = Map<string, ExistingRoomForImport>;

/** The actual fields this row will write, already resolved against whether
 * the target room has an existing layout. `usableSeats` is always a concrete
 * number (upsert's Insert type requires it — usable_seats is NOT NULL with
 * no default) — for a room with a layout, or an existing room with no
 * Rows/Columns supplied, it's simply the room's CURRENT value passed
 * through unchanged, not recomputed. `usableSeatsRecomputed` tells the
 * caller/UI whether this write actually changes capacity, per the
 * protection rule above. */
export interface PlannedRoomWrite {
  roomNumber: string;
  code: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
  additionalSeats: number;
  status: RoomStatus;
  usableSeats: number;
  usableSeatsRecomputed: boolean;
}

export interface RoomImportSummary {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  added: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

export interface RoomImportResult {
  rows: RoomImportRowResult[];
  summary: RoomImportSummary;
}

function normalizeStatus(value: unknown): RoomStatus | null {
  const text = normalizeText(value);
  if (!text) return "active"; // blank = default, not an error
  const lower = text.toLowerCase();
  if (lower === "active") return "active";
  if (lower === "inactive") return "inactive";
  return null;
}

/**
 * Pure function: no I/O. Used identically by the preview step and the
 * confirm step (re-run server-side against a fresh DB snapshot before
 * writing).
 */
export function classifyRoomImportRows(
  parsedRows: { rowNumber: number; raw: Record<RoomColumnKey, unknown> }[],
  existingRoomsByCode: ExistingRoomsByCode
): RoomImportResult {
  const seenCodes = new Map<string, number>(); // code -> first rowNumber

  const rows: RoomImportRowResult[] = parsedRows.map(({ rowNumber, raw }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const roomNumber = normalizeText(raw.roomNumber);
    const codeRaw = normalizeText(raw.code);
    const code = codeRaw ? codeRaw.toUpperCase() : null;
    const block = normalizeText(raw.block);
    const floor = normalizeText(raw.floor);
    const landmark = normalizeText(raw.landmark);
    const additionalSeatsRaw = raw.additionalSeats;
    const statusResult = normalizeStatus(raw.status);

    if (!roomNumber) errors.push("Room Number is required.");
    if (!code) errors.push("Code is required.");
    if (statusResult === null) errors.push('Status must be "Active" or "Inactive".');

    let additionalSeats = 0;
    const additionalSeatsText = normalizeText(additionalSeatsRaw);
    if (additionalSeatsText) {
      const parsed = normalizeInt(additionalSeatsRaw, 0);
      if (parsed === null) errors.push("Additional Seats must be a whole number, zero or greater.");
      else additionalSeats = parsed;
    }

    let rowsCount: number | null = null;
    const rowsText = normalizeText(raw.rows);
    if (rowsText) {
      const parsed = normalizeInt(raw.rows, 1);
      if (parsed === null) warnings.push("Rows looks invalid — ignored (informational only).");
      else rowsCount = parsed;
    }

    let columnsCount: number | null = null;
    const columnsText = normalizeText(raw.columns);
    if (columnsText) {
      const parsed = normalizeInt(raw.columns, 1);
      if (parsed === null) warnings.push("Columns looks invalid — ignored (informational only).");
      else columnsCount = parsed;
    }

    if (errors.length > 0) {
      return { rowNumber, raw, normalized: null, severity: "error", classification: "rejected", messages: errors, plannedWrite: null };
    }

    const normalized: NormalizedRoomImportRow = {
      roomNumber: roomNumber!,
      code: code!,
      block,
      floor,
      landmark,
      rows: rowsCount,
      columns: columnsCount,
      additionalSeats,
      status: statusResult!,
    };

    const priorRow = seenCodes.get(normalized.code);
    if (priorRow !== undefined) {
      errors.push(`Duplicate Code — also appears in row ${priorRow}.`);
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors, plannedWrite: null };
    }
    seenCodes.set(normalized.code, rowNumber);

    const existing = existingRoomsByCode.get(normalized.code);

    if (!existing && (normalized.rows === null || normalized.columns === null)) {
      errors.push("Rows and Columns are required when creating a new room via import (used only to estimate starting capacity — they won't generate a layout).");
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors, plannedWrite: null };
    }

    if (existing?.hasLayout && (normalized.rows !== null || normalized.columns !== null)) {
      warnings.push(
        "This room already has a saved layout — Rows, Columns and Usable Seats were not changed. Use Room Layout Import or the Room Layout editor to update the actual layout."
      );
    }

    // usableSeats is recomputed only when this room has no saved layout AND
    // Rows/Columns were supplied — otherwise it's the room's CURRENT value,
    // written back unchanged (upsert always needs a concrete number; see
    // PlannedRoomWrite's doc comment).
    const canRecompute = !existing?.hasLayout && normalized.rows !== null && normalized.columns !== null;
    const usableSeats = canRecompute
      ? normalized.rows! * normalized.columns! + normalized.additionalSeats
      : (existing?.usableSeats ?? 0);

    const plannedWrite: PlannedRoomWrite = {
      roomNumber: normalized.roomNumber,
      code: normalized.code,
      block: normalized.block,
      floor: normalized.floor,
      landmark: normalized.landmark,
      additionalSeats: normalized.additionalSeats,
      status: normalized.status,
      usableSeats,
      usableSeatsRecomputed: canRecompute,
    };

    let classification: RowClassification;
    if (!existing) {
      classification = "added";
    } else {
      const changed =
        existing.roomNumber !== plannedWrite.roomNumber ||
        (existing.block ?? null) !== plannedWrite.block ||
        (existing.floor ?? null) !== plannedWrite.floor ||
        (existing.landmark ?? null) !== plannedWrite.landmark ||
        existing.additionalSeats !== plannedWrite.additionalSeats ||
        existing.status !== plannedWrite.status ||
        (plannedWrite.usableSeatsRecomputed && plannedWrite.usableSeats !== existing.usableSeats);
      classification = changed ? "updated" : "unchanged";
    }

    return {
      rowNumber,
      raw,
      normalized,
      severity: warnings.length > 0 ? "warning" : "valid",
      classification,
      messages: warnings,
      plannedWrite,
    };
  });

  return { rows, summary: summarize(rows) };
}

function summarize(rows: RoomImportRowResult[]): RoomImportSummary {
  return {
    totalRows: rows.length,
    valid: rows.filter((r) => r.severity === "valid").length,
    warnings: rows.filter((r) => r.severity === "warning").length,
    errors: rows.filter((r) => r.severity === "error").length,
    added: rows.filter((r) => r.classification === "added").length,
    updated: rows.filter((r) => r.classification === "updated").length,
    unchanged: rows.filter((r) => r.classification === "unchanged").length,
    rejected: rows.filter((r) => r.classification === "rejected").length,
  };
}
