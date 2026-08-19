"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { prepareConsolidatedImport, ExcelParseError } from "@/lib/excel/consolidated-pipeline";
import { groupConsolidatedRowsBySession } from "@/lib/validation/consolidated-import";
import type { ConsolidatedImportResult, ConsolidatedImportSummary } from "@/lib/validation/consolidated-import";
import type { ExaminationPeriod } from "@/types/database";

export interface ConsolidatedPreviewState {
  ok: boolean;
  error?: string;
  period?: Pick<ExaminationPeriod, "id" | "name" | "start_date" | "end_date">;
  sessionCount?: number;
  result?: ConsolidatedImportResult;
}

export interface ConsolidatedImportActionResult {
  ok: boolean;
  error?: string;
  periodId?: string;
  sessionsCreated?: number;
  sessionsReused?: number;
  summary?: ConsolidatedImportSummary;
}

async function loadPeriod(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  periodId: string
): Promise<ExaminationPeriod | null> {
  const { data } = await supabase.from("examination_periods").select("*").eq("id", periodId).maybeSingle();
  return data;
}

export async function previewConsolidatedImportAction(formData: FormData): Promise<ConsolidatedPreviewState> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const periodId = String(formData.get("periodId") ?? "").trim();
  if (!periodId) return { ok: false, error: "Select an examination period." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to preview." };

  const supabase = await createSupabaseServerClient();
  const period = await loadPeriod(supabase, periodId);
  if (!period) return { ok: false, error: "That examination period no longer exists." };

  try {
    const prepared = await prepareConsolidatedImport(supabase, file, period);
    const { sessions } = groupConsolidatedRowsBySession(prepared.result.rows);
    return {
      ok: true,
      period: { id: period.id, name: period.name, start_date: period.start_date, end_date: period.end_date },
      sessionCount: sessions.size,
      result: prepared.result,
    };
  } catch (error) {
    if (error instanceof ExcelParseError) return { ok: false, error: error.message };
    console.error("Consolidated import preview failed:", error);
    return { ok: false, error: "Unable to process the uploaded file. Please try again." };
  }
}

export async function importConsolidatedImportAction(formData: FormData): Promise<ConsolidatedImportActionResult> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const periodId = String(formData.get("periodId") ?? "").trim();
  if (!periodId) return { ok: false, error: "Select an examination period." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to import." };

  const supabase = await createSupabaseServerClient();
  const period = await loadPeriod(supabase, periodId);
  if (!period) return { ok: false, error: "That examination period no longer exists." };

  // Confirm ALWAYS re-runs the exact same server-side classification the
  // preview used, against a fresh DB snapshot — never trusts anything the
  // browser reports back about which rows are valid.
  let prepared;
  try {
    prepared = await prepareConsolidatedImport(supabase, file, period);
  } catch (error) {
    if (error instanceof ExcelParseError) return { ok: false, error: error.message };
    console.error("Consolidated import (prepare) failed:", error);
    return { ok: false, error: "Unable to process the uploaded file. Please try again." };
  }

  const { result, fileName } = prepared;
  const { sessions, unplaced } = groupConsolidatedRowsBySession(result.rows);

  if (sessions.size === 0) {
    return { ok: false, error: "No valid rows were found — nothing was imported. See the preview for details." };
  }

  let sessionsCreated = 0;
  let sessionsReused = 0;
  let anyWriteFailed = false;
  const sessionKeys = Array.from(sessions.keys());

  for (let i = 0; i < sessionKeys.length; i++) {
    const key = sessionKeys[i];
    const sessionRows = sessions.get(key)!;
    const [examDate, sessionValue] = key.split("|") as [string, "FN" | "AN"];

    const { data: existingEvent } = await supabase
      .from("daily_examination_events")
      .select("id, examination_period_id, status")
      .eq("exam_date", examDate)
      .eq("session", sessionValue)
      .maybeSingle();

    let eventId: string;
    if (existingEvent) {
      // Re-check status fresh — classify already rejected rows targeting a
      // non-draft session at preview time, but this guards the (rare) case
      // where the session was published in the moments between preview and
      // confirm. No override: the whole session's writes are skipped and
      // recorded as a failure rather than partially applied.
      if (existingEvent.status !== "draft") {
        anyWriteFailed = true;
        continue;
      }
      eventId = existingEvent.id;
      sessionsReused++;
      if (!existingEvent.examination_period_id) {
        await supabase.from("daily_examination_events").update({ examination_period_id: period.id }).eq("id", eventId);
      }
    } else {
      const { data: newEvent, error } = await supabase
        .from("daily_examination_events")
        .insert({
          exam_date: examDate,
          session: sessionValue,
          examination_period_id: period.id,
          status: "draft",
          created_by: adminSession.user.id,
        })
        .select("id")
        .single();

      if (error || !newEvent) {
        anyWriteFailed = true;
        continue;
      }
      eventId = newEvent.id;
      sessionsCreated++;
      await logAuditEvent(supabase, {
        adminId: adminSession.user.id,
        action: "daily_event_created",
        entityType: "daily_examination_event",
        entityId: eventId,
        newValue: { exam_date: examDate, session: sessionValue, examination_period_id: period.id, source: "consolidated_import" },
      });
    }

    const rowsForThisBatch = i === 0 ? [...sessionRows, ...unplaced] : sessionRows;

    const addedCount = rowsForThisBatch.filter((r) => r.classification === "added").length;
    const updatedCount = rowsForThisBatch.filter((r) => r.classification === "updated").length;
    const unchangedCount = rowsForThisBatch.filter((r) => r.classification === "unchanged").length;
    const rejectedCount = rowsForThisBatch.filter((r) => r.classification === "rejected").length;
    const warningCount = rowsForThisBatch.filter((r) => r.severity === "warning").length;

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        daily_examination_event_id: eventId,
        import_type: "consolidated",
        file_name: fileName,
        uploaded_by: adminSession.user.id,
        total_rows: rowsForThisBatch.length,
        valid_rows: addedCount + updatedCount + unchangedCount,
        error_rows: rejectedCount,
        warning_rows: warningCount,
        status: "validated",
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      anyWriteFailed = true;
      continue;
    }

    // Course groups for THIS session — Strength is always the computed
    // group count, never a value read from the file.
    const groupsForSession = result.courseGroups.filter((g) => g.examDate === examDate && g.session === sessionValue);

    // Keyed by the full course context (approved decision #4): Programme +
    // Course Code + Year + Term. Two groups sharing a Programme+Course Code
    // but differing Year/Term are different courses and must never collide.
    const recordIdByProgrammeCourse = new Map<string, string>();
    if (groupsForSession.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from("master_timetable_records")
        .upsert(
          groupsForSession.map((g) => ({
            daily_examination_event_id: eventId,
            programme: g.programme,
            course_name: g.courseName,
            course_code: g.courseCode,
            year: g.year,
            term: g.term,
            strength: g.computedStrength,
            import_batch_id: batch.id,
          })),
          { onConflict: "daily_examination_event_id,programme,course_code,year,term" }
        )
        .select("id, programme, course_code, year, term");

      if (upsertError) {
        anyWriteFailed = true;
        await supabase.from("import_errors").insert({
          import_batch_id: batch.id,
          row_number: 0,
          error_message: `Failed to save course/timetable data: ${upsertError.message}`,
          raw_data: null,
          severity: "error",
        });
      } else {
        for (const record of upserted ?? []) {
          recordIdByProgrammeCourse.set(`${record.programme}|${record.course_code}|${record.year}|${record.term}`, record.id);
        }
      }
    }

    // Student registrations — mirrors the existing Roster importer's write
    // logic exactly (find-or-create student, insert seat_allocations only
    // for genuinely new registrations).
    for (const row of sessionRows) {
      if (row.classification === "rejected" || row.classification === "unchanged" || !row.normalized) continue;
      const normalized = row.normalized;
      const masterTimetableRecordId = recordIdByProgrammeCourse.get(
        `${normalized.programme}|${normalized.courseCode}|${normalized.year}|${normalized.term}`
      );
      if (!masterTimetableRecordId) continue; // upsert for this group failed — already recorded above

      const { data: existingStudent, error: findError } = await supabase
        .from("students")
        .select("id")
        .eq("register_no_key", normalized.registerNoKey)
        .maybeSingle();

      if (findError) {
        anyWriteFailed = true;
        await supabase.from("import_errors").insert({
          import_batch_id: batch.id,
          row_number: row.rowNumber,
          error_message: `Failed to look up student: ${findError.message}`,
          raw_data: row.raw,
          severity: "error",
        });
        continue;
      }

      let studentId = existingStudent?.id;

      if (!studentId) {
        const { data: created, error: insertError } = await supabase
          .from("students")
          .insert({
            register_no: normalized.registerNo,
            full_name: normalized.studentName,
            programme: normalized.programme,
            department: normalized.department,
            gender: normalized.gender,
          })
          .select("id")
          .single();

        if (insertError || !created) {
          anyWriteFailed = true;
          await supabase.from("import_errors").insert({
            import_batch_id: batch.id,
            row_number: row.rowNumber,
            error_message: `Failed to create student: ${insertError?.message ?? "unknown error"}`,
            raw_data: row.raw,
            severity: "error",
          });
          continue;
        }
        studentId = created.id;
      } else if (row.classification === "updated") {
        const { error: updateError } = await supabase
          .from("students")
          .update({
            full_name: normalized.studentName,
            programme: normalized.programme,
            department: normalized.department,
            gender: normalized.gender,
          })
          .eq("id", studentId);

        if (updateError) {
          anyWriteFailed = true;
          await supabase.from("import_errors").insert({
            import_batch_id: batch.id,
            row_number: row.rowNumber,
            error_message: `Failed to update student: ${updateError.message}`,
            raw_data: row.raw,
            severity: "error",
          });
          continue;
        }
      }

      if (row.classification === "added") {
        const { error: registrationError } = await supabase.from("seat_allocations").insert({
          student_id: studentId,
          daily_examination_event_id: eventId,
          master_timetable_record_id: masterTimetableRecordId,
          import_batch_id: batch.id,
        });

        if (registrationError) {
          anyWriteFailed = true;
          await supabase.from("import_errors").insert({
            import_batch_id: batch.id,
            row_number: row.rowNumber,
            error_message: `Failed to register student for this event: ${registrationError.message}`,
            raw_data: row.raw,
            severity: "error",
          });
        }
      }
    }

    const errorRowsToRecord = rowsForThisBatch.filter((r) => r.classification === "rejected");
    const warningRowsToRecord = rowsForThisBatch.filter((r) => r.severity === "warning" && r.classification !== "rejected");

    const errorInserts = [
      ...errorRowsToRecord.map((r) => ({
        import_batch_id: batch.id,
        row_number: r.rowNumber,
        error_message: r.messages.join(" ") || "This row could not be placed under any Daily Exam Session.",
        raw_data: r.raw,
        severity: "error" as const,
      })),
      ...warningRowsToRecord.map((r) => ({
        import_batch_id: batch.id,
        row_number: r.rowNumber,
        error_message: r.messages.join(" "),
        raw_data: r.raw,
        severity: "warning" as const,
      })),
    ];

    if (errorInserts.length > 0) {
      await supabase.from("import_errors").insert(errorInserts);
    }

    await supabase.from("import_batches").update({ status: "imported" }).eq("id", batch.id);
  }

  await logAuditEvent(supabase, {
    adminId: adminSession.user.id,
    action: "consolidated_data_imported",
    entityType: "examination_period",
    entityId: period.id,
    newValue: { sessionsCreated, sessionsReused, ...result.summary },
  });

  return {
    ok: !anyWriteFailed,
    error: anyWriteFailed ? "Some rows or sessions failed to save — see each session's import history for details." : undefined,
    periodId: period.id,
    sessionsCreated,
    sessionsReused,
    summary: result.summary,
  };
}
