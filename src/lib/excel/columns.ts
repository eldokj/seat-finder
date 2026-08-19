/**
 * Flexible header matching: an uploaded file's columns rarely match our
 * field names byte-for-byte ("Register No" vs "Register Number" vs
 * "RegisterNo"), so every expected field is matched against a list of
 * accepted aliases, case/whitespace/punctuation-insensitively, rather than
 * requiring an exact header string. This is what lets the import handle
 * "renamed columns" without a manual column-mapping UI.
 */

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export interface ColumnSpec<K extends string> {
  key: K;
  label: string;
  aliases: string[];
  required: boolean;
}

export interface ColumnMatchResult<K extends string> {
  /** field key -> index into the raw row array */
  mapping: Partial<Record<K, number>>;
  missingRequired: { key: K; label: string }[];
}

export function matchColumns<K extends string>(
  headers: string[],
  specs: ColumnSpec<K>[]
): ColumnMatchResult<K> {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping: Partial<Record<K, number>> = {};

  for (const spec of specs) {
    const aliasSet = new Set([spec.label, ...spec.aliases].map(normalizeHeader));
    const idx = normalizedHeaders.findIndex((h) => h !== "" && aliasSet.has(h));
    if (idx !== -1) mapping[spec.key] = idx;
  }

  const missingRequired = specs
    .filter((spec) => spec.required && mapping[spec.key] === undefined)
    .map((spec) => ({ key: spec.key, label: spec.label }));

  return { mapping, missingRequired };
}

/** Builds one raw-value object per data row, keyed by field name, using a resolved column mapping. */
export function projectRows<K extends string>(
  rows: unknown[][],
  mapping: Partial<Record<K, number>>
): Record<K, unknown>[] {
  return rows.map((row) => {
    const result = {} as Record<K, unknown>;
    for (const key of Object.keys(mapping) as K[]) {
      const idx = mapping[key];
      result[key] = idx === undefined ? null : (row[idx] ?? null);
    }
    return result;
  });
}

// Master Timetable / Student Roster column specs (TimetableColumnKey,
// TIMETABLE_COLUMNS, RosterColumnKey, ROSTER_COLUMNS) were removed along
// with the standalone two-step importers they belonged to — Consolidated
// Import (CONSOLIDATED_COLUMNS below) is now the only exam-data import
// workflow. See CLAUDE.md.

// ----------------------------------------------------------------------------
// Consolidated Exam + Student Data columns (Phase Import/Export)
// ----------------------------------------------------------------------------
// One row = one student in one course, within one Date + Session. Strength is
// deliberately NOT a column here — it's always computed by grouping rows on
// (Date, Session, Programme, Course Code, Year, Term), never entered by the
// admin. See src/lib/validation/consolidated-import.ts.
//
// Year + Term (added in the Year/Term phase, approved decision) are
// mandatory and participate in course-group identity alongside Programme +
// Course Code — see courseGroupKey() in consolidated-import.ts. Year is the
// student's academic/admission batch year (e.g. 2024, 2025, 2026), NOT
// "First Year"/"Second Year" — Term is the academic term/semester number
// (e.g. 1-6). Neither is stored on `students` — both live on
// master_timetable_records as part of the exam-specific course context.
export type ConsolidatedColumnKey =
  | "date"
  | "session"
  | "year"
  | "term"
  | "programme"
  | "department"
  | "courseCode"
  | "course"
  | "registerNumber"
  | "studentName"
  | "gender";

export const CONSOLIDATED_COLUMNS: ColumnSpec<ConsolidatedColumnKey>[] = [
  { key: "date", label: "Date", aliases: ["Exam Date"], required: true },
  { key: "session", label: "Session", aliases: [], required: true },
  { key: "year", label: "Year", aliases: ["Batch Year", "Admission Year"], required: true },
  { key: "term", label: "Term", aliases: ["Semester"], required: true },
  { key: "programme", label: "Programme", aliases: ["Program"], required: true },
  { key: "department", label: "Department", aliases: ["Dept"], required: true },
  { key: "courseCode", label: "Course Code", aliases: ["CourseCode", "Code"], required: true },
  { key: "course", label: "Course", aliases: ["Course Name"], required: true },
  { key: "registerNumber", label: "Register Number", aliases: ["Register No", "RegisterNo", "Reg No"], required: true },
  { key: "studentName", label: "Student Name", aliases: ["Name"], required: true },
  { key: "gender", label: "Gender", aliases: ["Sex"], required: false },
];

// ----------------------------------------------------------------------------
// Room Master columns (Phase Import/Export)
// ----------------------------------------------------------------------------
// Room Number + Block/Floor/Landmark/Additional Seats/Status match the New
// Room form 1:1. Code is required by the schema (rooms.code is unique, not
// nullable) but wasn't in the approved column list — added here since a room
// can't otherwise be created/matched; flagged in the implementation report.
// Rows/Columns are informational only — used ONLY to estimate a brand-new
// room's starting capacity (rows*columns + additionalSeats). They are NEVER
// written to rooms.rows/rooms.columns (those are the layout editor's
// app-maintained cache, "never hand-edited" per the 0003 migration comment)
// and NEVER create/modify room_seats rows. See room-import.ts.
export type RoomColumnKey = "roomNumber" | "code" | "block" | "floor" | "landmark" | "rows" | "columns" | "additionalSeats" | "status";

export const ROOM_COLUMNS: ColumnSpec<RoomColumnKey>[] = [
  { key: "roomNumber", label: "Room Number", aliases: ["Room", "Name"], required: true },
  { key: "code", label: "Code", aliases: ["Room Code"], required: true },
  { key: "block", label: "Block", aliases: ["Building"], required: false },
  { key: "floor", label: "Floor", aliases: [], required: false },
  { key: "landmark", label: "Landmark", aliases: [], required: false },
  { key: "rows", label: "Rows", aliases: [], required: false },
  { key: "columns", label: "Columns", aliases: ["Cols"], required: false },
  { key: "additionalSeats", label: "Additional Seats", aliases: ["Additional"], required: false },
  { key: "status", label: "Status", aliases: [], required: false },
];

// ----------------------------------------------------------------------------
// Room Layout columns (Phase Import/Export)
// ----------------------------------------------------------------------------
// Flat one-row-per-position representation of room_seats, matched against an
// existing room by Code (labelled "Room Number" per the approved column
// list — in this project's real data, a room's Code IS its short "M101"-style
// number). Layout import never creates rooms — the target room must already
// exist (via Room Master import or the New Room form). See
// room-layout-import.ts, which reuses room-layout.ts's existing
// validation/save logic rather than duplicating it.
export type RoomLayoutColumnKey = "roomCode" | "row" | "column" | "section" | "seatLabel" | "positionType" | "status";

export const ROOM_LAYOUT_COLUMNS: ColumnSpec<RoomLayoutColumnKey>[] = [
  { key: "roomCode", label: "Room Number", aliases: ["Room Code", "Code", "Room"], required: true },
  { key: "row", label: "Row", aliases: ["Row Number"], required: true },
  { key: "column", label: "Column", aliases: ["Column Number", "Col"], required: true },
  { key: "section", label: "Section", aliases: [], required: false },
  { key: "seatLabel", label: "Seat Label", aliases: ["Label"], required: false },
  { key: "positionType", label: "Position Type", aliases: ["Type"], required: true },
  { key: "status", label: "Status", aliases: [], required: false },
];
