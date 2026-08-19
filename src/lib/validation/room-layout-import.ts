import { normalizeText, normalizeInt } from "./import-normalize";
import type { RoomLayoutColumnKey } from "@/lib/excel/columns";
import type { SeatPositionType, RoomSeatStatus } from "@/types/database";
import type { RowSeverity, RowClassification } from "./import-shared";

/**
 * Import/Export architecture (approved) — Room Layout import. A flat
 * one-row-per-position file, matched against an EXISTING room (layout
 * import never creates rooms). Deliberately thin: field-level validation and
 * added/updated/unchanged classification happen here (pure, for the
 * preview), but the actual grid-completeness check, duplicate-label
 * detection, and — critically — the occupied-seat protection all reuse
 * room-layout.ts's existing `validateGrid` and the real
 * `saveRoomLayoutAction` (called once per room by the I/O layer), rather
 * than being re-implemented. See room-layout-pipeline.ts.
 */

export interface NormalizedLayoutImportRow {
  roomCode: string;
  rowNumber: number;
  columnNumber: number;
  section: string | null;
  seatLabel: string | null;
  positionType: SeatPositionType;
  status: RoomSeatStatus;
}

export interface LayoutImportRowResult {
  rowNumber: number;
  raw: Record<RoomLayoutColumnKey, unknown>;
  normalized: NormalizedLayoutImportRow | null;
  severity: RowSeverity;
  classification: RowClassification;
  messages: string[];
}

export interface ExistingLayoutCell {
  rowNumber: number;
  columnNumber: number;
  section: string | null;
  seatLabel: string | null;
  positionType: SeatPositionType;
  status: RoomSeatStatus;
}

/** What's already on record for a room this file references — `roomId` is
 * always present once the room itself is known to exist; `cells` is empty
 * for a room with no layout drawn yet. */
export interface ExistingRoomLayout {
  roomId: string;
  cells: ExistingLayoutCell[];
}

export type ExistingRoomLayoutsByCode = Map<string, ExistingRoomLayout>;

export interface LayoutImportSummary {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  added: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

export interface LayoutImportResult {
  rows: LayoutImportRowResult[];
  summary: LayoutImportSummary;
  /** Every distinct Room Code with at least one non-rejected row — what the
   * I/O layer needs to loop over to actually call saveRoomLayoutAction. */
  affectedRoomCodes: string[];
}

function normalizePositionType(value: unknown): SeatPositionType | null {
  const text = normalizeText(value);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === "seat") return "seat";
  if (lower === "gap") return "gap";
  return null;
}

function normalizeSeatStatus(value: unknown): RoomSeatStatus | null {
  const text = normalizeText(value);
  if (!text) return "available"; // blank = default, not an error
  const lower = text.toLowerCase();
  if (lower === "available") return "available";
  if (lower === "disabled") return "disabled";
  return null;
}

export function classifyLayoutImportRows(
  parsedRows: { rowNumber: number; raw: Record<RoomLayoutColumnKey, unknown> }[],
  existingRoomsByCode: ExistingRoomLayoutsByCode
): LayoutImportResult {
  const seenPositions = new Map<string, number>(); // roomCode|row|col -> first rowNumber
  const seenLabels = new Map<string, number>(); // roomCode|seatLabel -> first rowNumber

  const rows: LayoutImportRowResult[] = parsedRows.map(({ rowNumber, raw }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const roomCodeRaw = normalizeText(raw.roomCode);
    const roomCode = roomCodeRaw ? roomCodeRaw.toUpperCase() : null;
    const rowNum = normalizeInt(raw.row, 1);
    const colNum = normalizeInt(raw.column, 1);
    const section = normalizeText(raw.section);
    const positionType = normalizePositionType(raw.positionType);
    const statusResult = normalizeSeatStatus(raw.status);
    const seatLabelRaw = normalizeText(raw.seatLabel);

    if (!roomCode) errors.push("Room Number is required.");
    else if (!existingRoomsByCode.has(roomCode)) errors.push(`Unknown room "${roomCode}" — create it first (Room Master import or New Room).`);
    if (rowNum === null) errors.push("Row must be a whole number, 1 or greater.");
    if (colNum === null) errors.push("Column must be a whole number, 1 or greater.");
    if (!positionType) errors.push('Position Type must be "Seat" or "Gap".');
    if (statusResult === null) errors.push('Status must be "Available" or "Disabled".');

    let seatLabel: string | null = null;
    if (positionType === "seat") {
      if (!seatLabelRaw) errors.push("Seat Label is required for a seat position.");
      else seatLabel = seatLabelRaw;
    } else if (positionType === "gap" && seatLabelRaw) {
      warnings.push("Seat Label is ignored for a gap position.");
    }

    if (errors.length > 0) {
      return { rowNumber, raw, normalized: null, severity: "error", classification: "rejected", messages: errors };
    }

    const normalized: NormalizedLayoutImportRow = {
      roomCode: roomCode!,
      rowNumber: rowNum!,
      columnNumber: colNum!,
      section,
      seatLabel,
      positionType: positionType!,
      status: positionType === "gap" ? "available" : statusResult!,
    };

    const positionKey = `${normalized.roomCode}|${normalized.rowNumber}|${normalized.columnNumber}`;
    const priorPosition = seenPositions.get(positionKey);
    if (priorPosition !== undefined) {
      errors.push(`Duplicate position — also appears in row ${priorPosition}.`);
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }
    seenPositions.set(positionKey, rowNumber);

    if (normalized.positionType === "seat") {
      const labelKey = `${normalized.roomCode}|${normalized.seatLabel}`;
      const priorLabel = seenLabels.get(labelKey);
      if (priorLabel !== undefined) {
        errors.push(`Duplicate Seat Label within this room — also appears in row ${priorLabel}.`);
        return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
      }
      seenLabels.set(labelKey, rowNumber);
    }

    const existingRoom = existingRoomsByCode.get(normalized.roomCode)!;
    const existingCell = existingRoom.cells.find((c) => c.rowNumber === normalized.rowNumber && c.columnNumber === normalized.columnNumber);

    let classification: RowClassification;
    if (!existingCell) {
      classification = "added";
    } else {
      const changed =
        existingCell.positionType !== normalized.positionType ||
        existingCell.status !== normalized.status ||
        (existingCell.seatLabel ?? null) !== normalized.seatLabel ||
        (existingCell.section ?? null) !== normalized.section;
      classification = changed ? "updated" : "unchanged";
    }

    return {
      rowNumber,
      raw,
      normalized,
      severity: warnings.length > 0 ? "warning" : "valid",
      classification,
      messages: warnings,
    };
  });

  const affectedRoomCodes = Array.from(
    new Set(rows.filter((r) => r.classification !== "rejected" && r.normalized).map((r) => r.normalized!.roomCode))
  );

  return { rows, summary: summarize(rows), affectedRoomCodes };
}

function summarize(rows: LayoutImportRowResult[]): LayoutImportSummary {
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
