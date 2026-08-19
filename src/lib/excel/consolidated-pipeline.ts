import "server-only";

import { parseWorkbookBuffer, validateUploadedFile, ExcelParseError } from "./parse";
import { matchColumns, projectRows, CONSOLIDATED_COLUMNS } from "./columns";
import { normalizeExamDate, normalizeSession } from "@/lib/validation/import-normalize";
import { normalizeRegisterNumber } from "@/lib/utils/register-number";
import {
  classifyConsolidatedRows,
  sessionKey,
  type ConsolidatedImportResult,
  type ExistingConsolidatedSessionsMap,
  type ExistingConsolidatedRegistration,
} from "@/lib/validation/consolidated-import";
import type { ExistingStudent } from "@/lib/validation/import-shared";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExaminationPeriod } from "@/types/database";

export { ExcelParseError };

export interface PreparedConsolidatedImport {
  result: ConsolidatedImportResult;
  period: ExaminationPeriod;
  fileName: string;
  sheetName: string;
}

/**
 * Shared read-only pipeline used by BOTH the preview action and the confirm
 * (import) action for the Consolidated Exam + Student Data import — see
 * consolidated-import.ts for the classification rules. One file spans a
 * whole Examination Period, fanning out into per-Date+Session groups, and
 * resolves existing-student/registration lookups scoped across every
 * session found in the file rather than just one. Never writes anything
 * itself.
 */
export async function prepareConsolidatedImport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  file: File,
  period: ExaminationPeriod
): Promise<PreparedConsolidatedImport> {
  validateUploadedFile(file.name, file.size);

  const buffer = await file.arrayBuffer();
  const parsed = parseWorkbookBuffer(buffer, file.name);

  const { mapping, missingRequired } = matchColumns(parsed.headers, CONSOLIDATED_COLUMNS);
  if (missingRequired.length > 0) {
    throw new ExcelParseError(`Missing required column(s): ${missingRequired.map((c) => c.label).join(", ")}.`);
  }

  const projected = projectRows(parsed.rows, mapping);
  const parsedRows = projected.map((raw, index) => ({ rowNumber: index + 2, raw }));

  // Every (date, session) pair actually present in the file, so their
  // existing state can be fetched in one batch before classification.
  const candidateSessionKeys = new Set<string>();
  for (const { raw } of parsedRows) {
    const examDate = normalizeExamDate(raw.date);
    const session = normalizeSession(raw.session);
    if (examDate && session) candidateSessionKeys.add(sessionKey(examDate, session));
  }

  const existingSessions: ExistingConsolidatedSessionsMap = new Map();
  // recordId -> {programme, courseCode, year, term} — reused below to resolve
  // existing registrations' full course context without a second round-trip.
  const recordIdToCourse = new Map<string, { programme: string; courseCode: string; year: number; term: number }>();

  let relevantEventIds: string[] = [];

  if (candidateSessionKeys.size > 0) {
    const dates = Array.from(new Set(Array.from(candidateSessionKeys).map((k) => k.split("|")[0])));
    const { data: existingEvents } = await supabase
      .from("daily_examination_events")
      .select("id, exam_date, session, examination_period_id, status")
      .in("exam_date", dates);

    const relevantEvents = (existingEvents ?? []).filter((e) => candidateSessionKeys.has(sessionKey(e.exam_date, e.session)));
    relevantEventIds = relevantEvents.map((e) => e.id);

    if (relevantEvents.length > 0) {
      const { data: existingRecordRows } = await supabase
        .from("master_timetable_records")
        .select("id, daily_examination_event_id, programme, course_code, course_name, year, term, strength")
        .in("daily_examination_event_id", relevantEventIds);

      for (const record of existingRecordRows ?? []) {
        recordIdToCourse.set(record.id, {
          programme: record.programme,
          courseCode: record.course_code,
          year: record.year,
          term: record.term,
        });
      }

      for (const event of relevantEvents) {
        const records = (existingRecordRows ?? [])
          .filter((r) => r.daily_examination_event_id === event.id)
          .map((r) => ({
            programme: r.programme,
            courseCode: r.course_code,
            courseName: r.course_name,
            year: r.year,
            term: r.term,
            strength: r.strength,
          }));

        existingSessions.set(sessionKey(event.exam_date, event.session), {
          eventId: event.id,
          periodId: event.examination_period_id,
          status: event.status,
          records,
        });
      }
    }
  }

  // Register numbers found anywhere in the file, normalized — scopes the
  // existing-student/registration lookups to only what's relevant.
  const candidateRegisterKeys = Array.from(
    new Set(
      parsedRows
        .map((r) => (typeof r.raw.registerNumber === "string" ? r.raw.registerNumber : String(r.raw.registerNumber ?? "")))
        .filter(Boolean)
        .map((v) => normalizeRegisterNumber(v))
    )
  );

  let existingStudents: ExistingStudent[] = [];
  const existingRegistrations: ExistingConsolidatedRegistration[] = [];

  if (candidateRegisterKeys.length > 0) {
    const { data: studentRows } = await supabase
      .from("students")
      .select("id, register_no_key, full_name, programme, department, gender")
      .in("register_no_key", candidateRegisterKeys);

    existingStudents = (studentRows ?? []).map((s) => ({
      registerNoKey: s.register_no_key,
      fullName: s.full_name,
      programme: s.programme,
      department: s.department,
      gender: s.gender,
    }));

    const studentIds = (studentRows ?? []).map((s) => s.id);
    if (studentIds.length > 0 && relevantEventIds.length > 0) {
      const { data: registrationRows } = await supabase
        .from("seat_allocations")
        .select("student_id, daily_examination_event_id, master_timetable_record_id")
        .in("daily_examination_event_id", relevantEventIds)
        .in("student_id", studentIds);

      const studentIdToKey = new Map((studentRows ?? []).map((s) => [s.id, s.register_no_key]));
      const eventIdToDateSession = new Map<string, { examDate: string; session: string }>();
      for (const [key, session] of existingSessions) {
        const [examDate, sessionValue] = key.split("|");
        eventIdToDateSession.set(session.eventId, { examDate, session: sessionValue });
      }

      for (const row of registrationRows ?? []) {
        const registerNoKey = studentIdToKey.get(row.student_id);
        const dateSession = eventIdToDateSession.get(row.daily_examination_event_id);
        const course = recordIdToCourse.get(row.master_timetable_record_id);
        if (!registerNoKey || !dateSession || !course) continue;
        existingRegistrations.push({
          registerNoKey,
          examDate: dateSession.examDate,
          session: dateSession.session as ExistingConsolidatedRegistration["session"],
          programme: course.programme,
          courseCode: course.courseCode,
          year: course.year,
          term: course.term,
        });
      }
    }
  }

  const result = classifyConsolidatedRows(
    parsedRows,
    { id: period.id, startDate: period.start_date, endDate: period.end_date },
    existingSessions,
    existingStudents,
    existingRegistrations
  );

  return { result, period, fileName: file.name, sheetName: parsed.sheetName };
}
