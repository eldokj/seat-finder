import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { sortSeatedRows, filterSeatedRowsByYearTerm, type ReportSortKey } from "@/lib/validation/reports";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

export async function GET(request: Request, props: { params: Promise<{ eventId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();
  const event = await loadReportEvent(supabase, eventId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const sortParam = url.searchParams.get("sort");
  const sortBy: ReportSortKey = sortParam === "name" || sortParam === "room" ? sortParam : "registerNo";
  const yearParam = url.searchParams.get("year");
  const termParam = url.searchParams.get("term");
  const yearFilter = yearParam ? Number(yearParam) : undefined;
  const termFilter = termParam ? Number(termParam) : undefined;

  const rows = sortSeatedRows(filterSeatedRowsByYearTerm(await loadEventSeatedRows(supabase, eventId), { year: yearFilter, term: termFilter }), sortBy).map((r) => [
    r.registerNo,
    r.studentName,
    r.programme ?? "",
    r.courseCode,
    r.year ?? "",
    r.term ?? "",
    r.roomNumber,
    r.seatLabel,
  ]);

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "report_exported",
    entityType: "daily_examination_event",
    entityId: eventId,
    newValue: { report: "students", sortBy, yearFilter, termFilter },
  });

  return buildExcelResponse(
    "Students",
    ["Register No", "Student Name", "Programme", "Course Code", "Year", "Term", "Room", "Seat"],
    rows,
    `student-list-${event.examDate}-${event.session}.xlsx`
  );
}
