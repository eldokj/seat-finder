/**
 * Phase 9 — pure logic for Reports: sorting, grouping, utilization math,
 * and the notice-board publish gate. Zero I/O — the I/O layer
 * (lib/admin/reports-data-io.ts) reads from Supabase and hands plain data
 * here. Mirrors the pure/IO split used throughout this project.
 */

export interface SeatedRow {
  seatAllocationId: string;
  registerNo: string;
  studentName: string;
  programme: string | null;
  courseCode: string;
  courseName: string;
  /** Academic/admission batch year — from the course context (master_timetable_records), not the student record. */
  year: number | null;
  /** Academic term/semester — from the course context (master_timetable_records), not the student record. */
  term: number | null;
  roomId: string;
  roomNumber: string;
  seatLabel: string;
  seatKind: "grid" | "additional";
  rowNumber: number | null;
  columnNumber: number | null;
}

/** Approved decision #12 — Year/Term filtering for the Student-wise,
 * Programme-wise, and Course-wise reports only (not every report). Both
 * filters are optional and independent; applied before sort/group. */
export function filterSeatedRowsByYearTerm(rows: SeatedRow[], filters: { year?: number; term?: number }): SeatedRow[] {
  return rows.filter(
    (r) => (filters.year === undefined || r.year === filters.year) && (filters.term === undefined || r.term === filters.term)
  );
}

/** Distinct Year/Term values present in a report's rows, for filter dropdown
 * options — always derived from the UNFILTERED row set so options don't
 * shrink away as filters are applied. */
export function distinctYearsAndTerms(rows: SeatedRow[]): { years: number[]; terms: number[] } {
  return {
    years: Array.from(new Set(rows.map((r) => r.year).filter((y): y is number => y !== null))).sort((a, b) => a - b),
    terms: Array.from(new Set(rows.map((r) => r.term).filter((t): t is number => t !== null))).sort((a, b) => a - b),
  };
}

export type ReportSortKey = "registerNo" | "name" | "room";

export function sortSeatedRows(rows: SeatedRow[], sortBy: ReportSortKey): SeatedRow[] {
  const sorted = [...rows];
  switch (sortBy) {
    case "name":
      sorted.sort((a, b) => a.studentName.localeCompare(b.studentName));
      break;
    case "room":
      sorted.sort(
        (a, b) =>
          a.roomNumber.localeCompare(b.roomNumber) ||
          (a.rowNumber ?? 0) - (b.rowNumber ?? 0) ||
          (a.columnNumber ?? 0) - (b.columnNumber ?? 0) ||
          a.seatLabel.localeCompare(b.seatLabel)
      );
      break;
    case "registerNo":
    default:
      sorted.sort((a, b) => a.registerNo.localeCompare(b.registerNo));
      break;
  }
  return sorted;
}

export interface GroupedReport {
  groupKey: string;
  rows: SeatedRow[];
}

/** Generic grouping + alphabetical group order + register-number order
 * within each group — the same shape every grouped report (Programme-wise,
 * Course-wise, Room-wise-as-a-list) needs, so it's written once. */
export function groupSeatedRows(rows: SeatedRow[], keyFn: (row: SeatedRow) => string): GroupedReport[] {
  const map = new Map<string, SeatedRow[]>();
  for (const row of rows) {
    const key = keyFn(row) || "—";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupKey, groupRows]) => ({ groupKey, rows: sortSeatedRows(groupRows, "registerNo") }));
}

export function groupByProgramme(rows: SeatedRow[]): GroupedReport[] {
  return groupSeatedRows(rows, (r) => r.programme ?? "—");
}

export function groupByCourse(rows: SeatedRow[]): GroupedReport[] {
  return groupSeatedRows(rows, (r) => `${r.courseCode} — ${r.courseName}`);
}

export function groupByRoom(rows: SeatedRow[]): GroupedReport[] {
  return groupSeatedRows(rows, (r) => r.roomNumber);
}

/** Utilization %, one decimal place. Structurally seatedCount should never
 * exceed finalUsableCapacity — the allocator never overbooks a room — but
 * this doesn't assume that; it just reports the ratio as computed. */
export function computeUtilizationPercent(breakdown: { finalUsableCapacity: number }, seatedCount: number): number {
  if (breakdown.finalUsableCapacity <= 0) return 0;
  return Math.round((seatedCount / breakdown.finalUsableCapacity) * 1000) / 10;
}

/** The Notice-Board Seating Copy's hard gate — server-side, not just a UI
 * hide. Must be checked before any notice-board data is returned/rendered. */
export function isNoticeBoardAllowed(eventStatus: string): boolean {
  return eventStatus === "published";
}

/** Every other (internal) report shows this whenever the event isn't
 * published yet — usable before publish, but always clearly marked. */
export function needsDraftWatermark(eventStatus: string): boolean {
  return eventStatus !== "published";
}
