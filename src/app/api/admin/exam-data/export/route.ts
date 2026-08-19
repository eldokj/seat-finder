import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

/**
 * Import/Export architecture (approved) — reproduces the same 11-column
 * Consolidated Exam Data shape (including Year + Term) for a whole
 * Examination Period, so an admin can download what's currently on record
 * for offline review/edit and re-upload it. Avoids PostgREST embedded
 * selects (see CLAUDE.md) — three flat queries, joined in memory.
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period");
  if (!periodId) return NextResponse.json({ error: "Missing ?period=" }, { status: 400 });

  const supabase = await createSupabaseServerClient();

  const { data: period } = await supabase.from("examination_periods").select("id, name").eq("id", periodId).maybeSingle();
  if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: events } = await supabase
    .from("daily_examination_events")
    .select("id, exam_date, session")
    .eq("examination_period_id", periodId);

  const eventIds = (events ?? []).map((e) => e.id);
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));

  const rows: (string | number)[][] = [];

  if (eventIds.length > 0) {
    const { data: records } = await supabase
      .from("master_timetable_records")
      .select("id, daily_examination_event_id, programme, course_name, course_code, year, term")
      .in("daily_examination_event_id", eventIds);

    const recordById = new Map((records ?? []).map((r) => [r.id, r]));
    const recordIds = (records ?? []).map((r) => r.id);

    if (recordIds.length > 0) {
      const { data: allocations } = await supabase
        .from("seat_allocations")
        .select("student_id, daily_examination_event_id, master_timetable_record_id")
        .in("master_timetable_record_id", recordIds);

      const studentIds = Array.from(new Set((allocations ?? []).map((a) => a.student_id)));
      const { data: students } =
        studentIds.length > 0
          ? await supabase.from("students").select("id, register_no, full_name, department, gender").in("id", studentIds)
          : { data: [] };
      const studentById = new Map((students ?? []).map((s) => [s.id, s]));

      for (const allocation of allocations ?? []) {
        const event = eventById.get(allocation.daily_examination_event_id);
        const record = recordById.get(allocation.master_timetable_record_id);
        const student = studentById.get(allocation.student_id);
        if (!event || !record || !student) continue;
        rows.push([
          event.exam_date,
          event.session,
          record.year,
          record.term,
          record.programme,
          student.department ?? "",
          record.course_code,
          record.course_name,
          student.register_no,
          student.full_name,
          student.gender ?? "",
        ]);
      }
    }
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])) || String(a[8]).localeCompare(String(b[8])));

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "exam_data_exported",
    entityType: "examination_period",
    entityId: periodId,
    newValue: { rowCount: rows.length },
  });

  return buildExcelResponse(
    "Exam Data",
    ["Date", "Session", "Year", "Term", "Programme", "Department", "Course Code", "Course", "Register No", "Student Name", "Gender"],
    rows,
    `EXAM_DATA_${period.name.replace(/[^a-z0-9]+/gi, "_")}.xlsx`
  );
}
