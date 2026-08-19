import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { sortSeatedRows, needsDraftWatermark } from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";

/**
 * Printed blank attendance form only — per the approved Phase 9 decision,
 * no digital present/absent state is read or written anywhere. Signature
 * and Remarks columns are always empty; the invigilator fills them by hand.
 */
export default async function AttendanceSheetPage(props: PageProps<"/admin/reports/[eventId]/room/[roomId]/attendance">) {
  const { eventId, roomId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const { data: room } = await supabase.from("rooms").select("id, room_number").eq("id", roomId).maybeSingle();
  if (!room) notFound();

  const rows = sortSeatedRows(
    (await loadEventSeatedRows(supabase, eventId)).filter((r) => r.roomId === roomId),
    "room"
  );

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", entityType: "rooms", entityId: roomId, newValue: { report: "attendance_sheet", eventId } });
  }

  return (
    <div className="max-w-3xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} exportHref={`/api/admin/reports/${eventId}/attendance/export?roomId=${roomId}`} />
      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title={`Attendance Sheet — ${room.room_number}`} examDate={event.examDate} session={event.session} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No seated students in this room.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800">
              <th className="px-2 py-2 font-semibold text-slate-700">Seat No</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Register No</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Student Name</th>
              <th className="w-32 border-l border-slate-300 px-2 py-2 font-semibold text-slate-700">Signature</th>
              <th className="w-32 border-l border-slate-300 px-2 py-2 font-semibold text-slate-700">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.seatAllocationId} className="border-b border-slate-200">
                <td className="px-2 py-3">{row.seatLabel}</td>
                <td className="px-2 py-3">{row.registerNo}</td>
                <td className="px-2 py-3">{row.studentName}</td>
                <td className="border-l border-slate-200 px-2 py-3">&nbsp;</td>
                <td className="border-l border-slate-200 px-2 py-3">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
