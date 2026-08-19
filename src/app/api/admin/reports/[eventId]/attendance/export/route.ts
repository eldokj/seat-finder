import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { sortSeatedRows } from "@/lib/validation/reports";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

export async function GET(request: Request, props: { params: Promise<{ eventId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await props.params;
  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const event = await loadReportEvent(supabase, eventId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: room } = await supabase.from("rooms").select("room_number").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const rows = sortSeatedRows(
    (await loadEventSeatedRows(supabase, eventId)).filter((r) => r.roomId === roomId),
    "room"
  ).map((r) => [r.seatLabel, r.registerNo, r.studentName, "", ""]);

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "report_exported",
    entityType: "rooms",
    entityId: roomId,
    newValue: { report: "attendance_sheet", eventId },
  });

  return buildExcelResponse("Attendance", ["Seat No", "Register No", "Student Name", "Signature", "Remarks"], rows, `attendance-${room.room_number}-${event.examDate}-${event.session}.xlsx`);
}
