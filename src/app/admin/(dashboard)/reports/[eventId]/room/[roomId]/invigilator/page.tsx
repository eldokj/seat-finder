import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows, loadRoomCapacityReport } from "@/lib/admin/reports-data-io";
import { needsDraftWatermark } from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";

/**
 * Printable, handwritten-signature invigilator report — per the approved
 * Phase 9 decision, no invigilator name/assignment is stored anywhere;
 * the name/signature line is always blank for the invigilator to fill in.
 */
export default async function InvigilatorReportPage(props: PageProps<"/admin/reports/[eventId]/room/[roomId]/invigilator">) {
  const { eventId, roomId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const { data: room } = await supabase.from("rooms").select("id, room_number").eq("id", roomId).maybeSingle();
  if (!room) notFound();

  const [capacityRows, seatedRows] = await Promise.all([loadRoomCapacityReport(supabase, eventId), loadEventSeatedRows(supabase, eventId)]);
  const capacity = capacityRows.find((r) => r.roomId === roomId);
  const roomStudents = seatedRows.filter((r) => r.roomId === roomId);
  const courses = [...new Set(roomStudents.map((r) => `${r.courseCode} — ${r.courseName}`))].sort();

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", entityType: "rooms", entityId: roomId, newValue: { report: "invigilator", eventId } });
  }

  return (
    <div className="max-w-2xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} />
      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title={`Invigilator / Room Report — ${room.room_number}`} examDate={event.examDate} session={event.session} />

      <dl className="mb-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-base">
        <Row label="Room" value={room.room_number} />
        <Row label="Final Usable Capacity" value={String(capacity?.breakdown.finalUsableCapacity ?? 0)} />
        <Row label="Seated Students" value={String(capacity?.seatedCount ?? 0)} />
        <Row label="Utilization" value={`${capacity?.utilizationPercent ?? 0}%`} />
        <Row label="Course(s) in this room" value={courses.length > 0 ? courses.join("; ") : "—"} />
      </dl>

      <div className="rounded-xl border border-slate-300 p-6">
        <p className="mb-8 text-sm text-slate-500">Invigilator Name (please print): _______________________________________</p>
        <p className="text-sm text-slate-500">Signature: _______________________________________&nbsp;&nbsp;&nbsp;&nbsp; Date/Time: ____________________</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
