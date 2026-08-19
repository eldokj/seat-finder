import {
  normalizeExamDate,
  normalizeSession,
  normalizeText,
  normalizeCourseCode,
  isReasonableCourseCode,
  normalizeInt,
} from "./import-normalize";
import { normalizeRegisterNumber, isValidRegisterNumberInput } from "@/lib/utils/register-number";
import type { ExamSession, DailyEventStatus } from "@/types/database";
import type { ConsolidatedColumnKey } from "@/lib/excel/columns";
import { sessionKey, type RowSeverity, type RowClassification, type TargetExaminationPeriod, type ExistingStudent } from "./import-shared";

export { sessionKey };
export type { TargetExaminationPeriod, ExistingStudent };

/**
 * Import/Export architecture (approved) — the Consolidated Exam + Student
 * Data import. One Excel row = one student registered for one course within
 * one Date + Session. Deliberately NO Strength column: it's always computed
 * by grouping rows on (Date, Session, Programme, Course Code, Year, Term),
 * never typed by the admin — see `computeCourseGroups` below.
 *
 * Year + Term (approved decision) are mandatory and are part of COURSE
 * IDENTITY, not student identity: they live only on the course-group side
 * (`master_timetable_records`), never on `students`. A student's term
 * changes every semester and an arrear paper can put them in a different
 * term than their current one for that specific sitting — same reasoning
 * the schema already applies to seats ("never a permanent student column",
 * see supabase/migrations/0001_init.sql). Year is the academic/admission
 * batch year (2024, 2025, 2026, ...), never "First Year"/"Second Year".
 * Term is the academic term/semester number (1, 2, 3, ...).
 *
 * This is purely a simpler ADMIN UPLOAD EXPERIENCE over the same internal
 * tables (`master_timetable_records`, `students`, `seat_allocations`) the
 * original two-step Master Timetable / Student Roster importers used to
 * write to — the schema itself never changed. This is now the ONLY
 * exam-data import workflow; the two-step importers were fully removed as
 * a later product decision (see CLAUDE.md).
 */

export interface NormalizedConsolidatedRow {
  examDate: string;
  session: ExamSession;
  year: number;
  term: number;
  programme: string;
  department: string;
  courseCode: string;
  courseName: string;
  registerNo: string;
  registerNoKey: string;
  studentName: string;
  gender: string | null;
}

export interface ConsolidatedImportRowResult {
  rowNumber: number;
  raw: Record<ConsolidatedColumnKey, unknown>;
  normalized: NormalizedConsolidatedRow | null;
  severity: RowSeverity;
  /** Classification of the STUDENT REGISTRATION this row represents (not
   * the course/timetable group — see ConsolidatedCourseGroup for that). */
  classification: RowClassification;
  messages: string[];
}

/** What's already on record for one (examDate, session) pair, if anything —
 * extends the Timetable importer's shape with `status`, needed for the
 * published/closed protection decision, and `courseName` per record, needed
 * for the intra-file/against-DB course-name-mismatch warning. */
export interface ExistingConsolidatedRecord {
  programme: string;
  courseCode: string;
  courseName: string;
  year: number;
  term: number;
  strength: number;
}

export interface ExistingConsolidatedSession {
  eventId: string;
  periodId: string | null;
  status: DailyEventStatus;
  records: ExistingConsolidatedRecord[];
}

export type ExistingConsolidatedSessionsMap = Map<string, ExistingConsolidatedSession>;

/** For a given student, what course they're already registered for in a
 * given (examDate, session) — from a pre-existing seat_allocations row
 * (created by this importer on a prior run, or by the legacy Roster
 * importer; either way it's the same underlying table). Keyed by
 * `registrationKey`. */
export interface ExistingConsolidatedRegistration {
  registerNoKey: string;
  examDate: string;
  session: ExamSession;
  programme: string;
  courseCode: string;
  year: number;
  term: number;
}

export function registrationKey(registerNoKey: string, examDate: string, session: ExamSession): string {
  return `${registerNoKey}|${examDate}|${session}`;
}

export interface ConsolidatedImportSummary {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  added: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

/** One (Date, Session, Programme, Course Code, Year, Term) group — the
 * Master Timetable Record this upload will create/update/leave alone, with
 * its Strength always the count of non-rejected student rows in the group.
 * Year + Term are part of the group's identity: two groups sharing the same
 * Programme + Course Code but different Year/Term are different courses and
 * are never merged. */
export interface ConsolidatedCourseGroup {
  examDate: string;
  session: ExamSession;
  programme: string;
  courseCode: string;
  courseName: string;
  year: number;
  term: number;
  computedStrength: number;
  classification: "added" | "updated" | "unchanged";
  existingStrength: number | null;
}

export interface ConsolidatedImportResult {
  rows: ConsolidatedImportRowResult[];
  courseGroups: ConsolidatedCourseGroup[];
  summary: ConsolidatedImportSummary;
}

/** The full course-identity key (approved decision): Date + Session narrows
 * to one Daily Exam Session, then Programme + Course Code + Year + Term
 * identify the course itself. Two rows sharing everything but Year or Term
 * are DIFFERENT courses and must never collapse into one group/record. */
function courseGroupKey(
  examDate: string,
  session: ExamSession,
  programme: string,
  courseCode: string,
  year: number,
  term: number
): string {
  return `${sessionKey(examDate, session)}|${programme}|${courseCode}|${year}|${term}`;
}

/**
 * Pure function: no I/O. Mirrors classifyTimetableRows + classifyRosterRows
 * combined into one pass over one file, plus the published/closed session
 * guard (decision #4 — reject rows targeting a non-draft session, no
 * override workflow). Used identically by the preview step and the confirm
 * step (re-run server-side against a fresh DB snapshot before writing).
 */
export function classifyConsolidatedRows(
  parsedRows: { rowNumber: number; raw: Record<ConsolidatedColumnKey, unknown> }[],
  targetPeriod: TargetExaminationPeriod,
  existingSessions: ExistingConsolidatedSessionsMap,
  existingStudents: ExistingStudent[],
  existingRegistrations: ExistingConsolidatedRegistration[]
): ConsolidatedImportResult {
  const studentByKey = new Map(existingStudents.map((s) => [s.registerNoKey, s]));
  const registrationByKey = new Map(
    existingRegistrations.map((r) => [registrationKey(r.registerNoKey, r.examDate, r.session), r])
  );

  // Within-file tracking, all keyed so the same conflict logic scales to a
  // file spanning many Date+Session pairs (not just the one the legacy
  // Roster importer targets at a time).
  const seenExactRow = new Map<string, number>(); // registrationKey|full course context -> first rowNumber
  const seenStudentSession = new Map<string, { rowNumber: number; programme: string; courseCode: string; year: number; term: number }>(); // registrationKey -> first row's course context
  const seenStudentProfile = new Map<string, { rowNumber: number; programme: string; department: string }>(); // registerNoKey -> first row's profile
  const seenGroupCourseName = new Map<string, { rowNumber: number; courseName: string }>(); // courseGroupKey -> first row's course name

  const rows: ConsolidatedImportRowResult[] = parsedRows.map(({ rowNumber, raw }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const examDate = normalizeExamDate(raw.date);
    const session = normalizeSession(raw.session);
    const year = normalizeInt(raw.year, 2000);
    const term = normalizeInt(raw.term, 1);
    const programme = normalizeText(raw.programme);
    const department = normalizeText(raw.department);
    const courseCode = normalizeCourseCode(raw.courseCode);
    const courseName = normalizeText(raw.course);
    const registerNoRaw = normalizeText(raw.registerNumber);
    const studentName = normalizeText(raw.studentName);
    const gender = normalizeText(raw.gender);

    if (!examDate) errors.push("Invalid or missing Date.");
    if (!session) errors.push("Invalid or missing Session (must be FN or AN).");
    if (year === null) errors.push("Year is required and must be a valid 4-digit academic/admission batch year (e.g. 2024).");
    if (term === null) errors.push("Term is required and must be a positive whole number (e.g. 1-6).");
    if (!programme) errors.push("Programme is required.");
    if (!department) errors.push("Department is required.");
    if (!courseCode) errors.push("Course Code is required.");
    else if (!isReasonableCourseCode(courseCode))
      warnings.push("Course Code format looks unusual — please double-check it.");
    if (!courseName) errors.push("Course is required.");
    if (!registerNoRaw) errors.push("Register Number is required.");
    else if (!isValidRegisterNumberInput(registerNoRaw)) errors.push("Register Number is invalid or too long.");
    if (!studentName) errors.push("Student Name is required.");

    if (errors.length > 0) {
      return { rowNumber, raw, normalized: null, severity: "error", classification: "rejected", messages: errors };
    }

    const normalized: NormalizedConsolidatedRow = {
      examDate: examDate!,
      session: session!,
      year: year!,
      term: term!,
      programme: programme!,
      department: department!,
      courseCode: courseCode!,
      courseName: courseName!,
      registerNo: registerNoRaw!,
      registerNoKey: normalizeRegisterNumber(registerNoRaw!),
      studentName: studentName!,
      gender,
    };

    if (normalized.examDate < targetPeriod.startDate || normalized.examDate > targetPeriod.endDate) {
      errors.push(
        `This row's Date (${normalized.examDate}) falls outside the selected examination period (${targetPeriod.startDate} to ${targetPeriod.endDate}).`
      );
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }

    const sKey = sessionKey(normalized.examDate, normalized.session);
    const existingSession = existingSessions.get(sKey);

    if (existingSession && existingSession.periodId && existingSession.periodId !== targetPeriod.id) {
      errors.push(`${normalized.examDate} ${normalized.session} already belongs to a different examination period.`);
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }

    if (existingSession && existingSession.status !== "draft") {
      errors.push(
        `${normalized.examDate} ${normalized.session} is already ${existingSession.status} — published or closed Daily Exam Sessions can't accept new import data.`
      );
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }

    const regKey = registrationKey(normalized.registerNoKey, normalized.examDate, normalized.session);

    // Full course context (approved decision #5): Programme + Course Code +
    // Year + Term. Comparing Course Code alone would wrongly treat two
    // different batch/term contexts sharing a code as "the same course".
    const exactKey = `${regKey}|${normalized.programme}|${normalized.courseCode}|${normalized.year}|${normalized.term}`;
    const exactDupeRow = seenExactRow.get(exactKey);
    if (exactDupeRow !== undefined) {
      errors.push(`Exact duplicate of row ${exactDupeRow}.`);
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }

    const priorInFileSameSession = seenStudentSession.get(regKey);
    if (
      priorInFileSameSession &&
      (priorInFileSameSession.programme !== normalized.programme ||
        priorInFileSameSession.courseCode !== normalized.courseCode ||
        priorInFileSameSession.year !== normalized.year ||
        priorInFileSameSession.term !== normalized.term)
    ) {
      errors.push(
        `This Register Number already appears for ${normalized.examDate} ${normalized.session} under a different course in row ${priorInFileSameSession.rowNumber}.`
      );
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }

    const existingRegistration = registrationByKey.get(regKey);
    if (
      existingRegistration &&
      (existingRegistration.programme !== normalized.programme ||
        existingRegistration.courseCode !== normalized.courseCode ||
        existingRegistration.year !== normalized.year ||
        existingRegistration.term !== normalized.term)
    ) {
      errors.push(
        `This student is already registered for a different course (${existingRegistration.programme} ${existingRegistration.courseCode}, Year ${existingRegistration.year} Term ${existingRegistration.term}) in this Daily Exam Session.`
      );
      return { rowNumber, raw, normalized, severity: "error", classification: "rejected", messages: errors };
    }

    seenExactRow.set(exactKey, rowNumber);
    seenStudentSession.set(regKey, {
      rowNumber,
      programme: normalized.programme,
      courseCode: normalized.courseCode,
      year: normalized.year,
      term: normalized.term,
    });

    // Warning-only: same student, different Programme/Department earlier in
    // this same file (their profile should be consistent — flagged for
    // review, never blocking).
    const priorProfile = seenStudentProfile.get(normalized.registerNoKey);
    if (priorProfile && (priorProfile.programme !== normalized.programme || priorProfile.department !== normalized.department)) {
      warnings.push(
        `Programme/Department differs from row ${priorProfile.rowNumber} for the same Register Number in this file.`
      );
    } else if (!priorProfile) {
      seenStudentProfile.set(normalized.registerNoKey, { rowNumber, programme: normalized.programme, department: normalized.department });
    }

    // Warning-only: course name inconsistent within the same group in this file.
    const gKey = courseGroupKey(
      normalized.examDate,
      normalized.session,
      normalized.programme,
      normalized.courseCode,
      normalized.year,
      normalized.term
    );
    const priorGroupName = seenGroupCourseName.get(gKey);
    if (priorGroupName && priorGroupName.courseName.toUpperCase() !== normalized.courseName.toUpperCase()) {
      warnings.push(`Course name differs from row ${priorGroupName.rowNumber} for the same Course Code/Year/Term in this file.`);
    } else if (!priorGroupName) {
      seenGroupCourseName.set(gKey, { rowNumber, courseName: normalized.courseName });
    }

    // Warning-only: course name conflicts with what's already saved for this
    // (event, programme, courseCode, year, term) — the existing DB record is
    // authoritative.
    const existingRecord = existingSession?.records.find(
      (r) =>
        r.programme === normalized.programme &&
        r.courseCode === normalized.courseCode &&
        r.year === normalized.year &&
        r.term === normalized.term
    );
    if (existingRecord && existingRecord.courseName.toUpperCase() !== normalized.courseName.toUpperCase()) {
      warnings.push(
        `Course name "${normalized.courseName}" doesn't exactly match the existing record's "${existingRecord.courseName}" for this code — the existing name is authoritative.`
      );
    }

    const existingStudent = studentByKey.get(normalized.registerNoKey);
    let classification: RowClassification;
    if (existingRegistration) {
      const profileChanged =
        !existingStudent ||
        existingStudent.fullName !== normalized.studentName ||
        existingStudent.programme !== normalized.programme ||
        existingStudent.department !== normalized.department ||
        (existingStudent.gender ?? null) !== normalized.gender;
      classification = profileChanged ? "updated" : "unchanged";
    } else {
      classification = "added";
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

  return { rows, courseGroups: computeCourseGroups(rows, existingSessions), summary: summarize(rows) };
}

/** Groups every non-rejected row into its (Date, Session, Programme, Course
 * Code, Year, Term) course group, computing Strength as the group's row
 * count (never an input field) and classifying the group itself against
 * what's already on record — mirrors classifyTimetableRows'
 * added/updated/unchanged logic, just driven by a computed count instead of
 * a typed-in Strength. Two groups sharing Programme + Course Code but
 * differing in Year or Term are separate groups with separate Strength
 * counts — never combined (approved decision #6). */
function computeCourseGroups(
  rows: ConsolidatedImportRowResult[],
  existingSessions: ExistingConsolidatedSessionsMap
): ConsolidatedCourseGroup[] {
  const groups = new Map<
    string,
    {
      examDate: string;
      session: ExamSession;
      programme: string;
      courseCode: string;
      courseName: string;
      year: number;
      term: number;
      count: number;
    }
  >();

  for (const row of rows) {
    if (row.classification === "rejected" || !row.normalized) continue;
    const n = row.normalized;
    const key = courseGroupKey(n.examDate, n.session, n.programme, n.courseCode, n.year, n.term);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, {
        examDate: n.examDate,
        session: n.session,
        programme: n.programme,
        courseCode: n.courseCode,
        courseName: n.courseName,
        year: n.year,
        term: n.term,
        count: 1,
      });
    }
  }

  return Array.from(groups.values()).map((g) => {
    const existingSession = existingSessions.get(sessionKey(g.examDate, g.session));
    const existingRecord = existingSession?.records.find(
      (r) => r.programme === g.programme && r.courseCode === g.courseCode && r.year === g.year && r.term === g.term
    );
    const classification: ConsolidatedCourseGroup["classification"] = !existingRecord
      ? "added"
      : existingRecord.strength === g.count
        ? "unchanged"
        : "updated";
    return {
      examDate: g.examDate,
      session: g.session,
      programme: g.programme,
      courseCode: g.courseCode,
      courseName: g.courseName,
      year: g.year,
      term: g.term,
      computedStrength: g.count,
      classification,
      existingStrength: existingRecord?.strength ?? null,
    };
  });
}

function summarize(rows: ConsolidatedImportRowResult[]): ConsolidatedImportSummary {
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

/**
 * Groups successfully-normalized rows by the (Date, Session) they belong
 * to. A group only earns a real Daily Exam Session if at least one of its
 * rows isn't rejected — a group consisting entirely of rejected rows
 * (e.g. every row's date fell outside the period) falls back into
 * `unplaced` instead, so its errors still get recorded without a phantom
 * session appearing anywhere.
 */
export function groupConsolidatedRowsBySession(
  rows: ConsolidatedImportRowResult[]
): { sessions: Map<string, ConsolidatedImportRowResult[]>; unplaced: ConsolidatedImportRowResult[] } {
  const candidateSessions = new Map<string, ConsolidatedImportRowResult[]>();
  const unplaced: ConsolidatedImportRowResult[] = [];

  for (const row of rows) {
    if (!row.normalized) {
      unplaced.push(row);
      continue;
    }
    const key = sessionKey(row.normalized.examDate, row.normalized.session);
    const list = candidateSessions.get(key) ?? [];
    list.push(row);
    candidateSessions.set(key, list);
  }

  const sessions = new Map<string, ConsolidatedImportRowResult[]>();
  for (const [key, groupRows] of candidateSessions) {
    if (groupRows.some((r) => r.classification !== "rejected")) {
      sessions.set(key, groupRows);
    } else {
      unplaced.push(...groupRows);
    }
  }

  return { sessions, unplaced };
}
