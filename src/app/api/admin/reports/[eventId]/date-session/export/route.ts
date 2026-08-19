import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { groupByRoom } from "@/lib/validation/reports";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

// Route Handlers don't inherit layouts (see CLAUDE.md) — the admin guard is
// re-checked explicitly here, same as every other app/api/admin/** route.
export async function GET(_request: Request, props: { params: Promise<{ eventId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();
  const event = await loadReportEvent(supabase, eventId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const groups = groupByRoom(await loadEventSeatedRows(supabase, eventId));
  const rows = groups.flatMap((g) => g.rows.map((r) => [r.roomNumber, r.seatLabel, r.registerNo, r.studentName, r.programme ?? "", r.courseCode, r.year ?? "", r.term ?? ""]));

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "report_exported",
    entityType: "daily_examination_event",
    entityId: eventId,
    newValue: { report: "date_session" },
  });

  return buildExcelResponse(
    "Date-Session",
    ["Room", "Seat", "Register No", "Student Name", "Programme", "Course Code", "Year", "Term"],
    rows,
    `date-session-${event.examDate}-${event.session}.xlsx`
  );
}
