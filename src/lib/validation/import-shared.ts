import type { ExamSession } from "@/types/database";

/**
 * Genuinely shared pure types/helpers used by every current import
 * pipeline (`consolidated-import.ts`, `room-import.ts`,
 * `room-layout-import.ts`). Originally lived in the standalone Master
 * Timetable / Student Roster importers before those were removed as a
 * product decision (Consolidated Import is now the only exam-data import
 * workflow) — extracted here rather than deleted, since they're still
 * genuinely needed by the surviving pipelines. See CLAUDE.md.
 */

export type RowSeverity = "valid" | "warning" | "error";
export type RowClassification = "added" | "updated" | "unchanged" | "rejected";

/** The whole Examination Period a Consolidated import targets — NOT a
 * single Date + Session. One upload can (and normally will) span the whole
 * period, fanning out into multiple Daily Exam Sessions, one per unique
 * (Date, Session) pair found in the file. */
export interface TargetExaminationPeriod {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export function sessionKey(examDate: string, session: ExamSession): string {
  return `${examDate}|${session}`;
}

/** A student who already exists in the students table (any event, any time). */
export interface ExistingStudent {
  registerNoKey: string;
  fullName: string;
  programme: string | null;
  department: string | null;
  gender: string | null;
}
