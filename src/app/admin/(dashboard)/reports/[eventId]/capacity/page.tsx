import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadRoomCapacityReport } from "@/lib/admin/reports-data-io";
import { needsDraftWatermark } from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";

export default async function CapacityReportPage(props: PageProps<"/admin/reports/[eventId]/capacity">) {
  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const rows = (await loadRoomCapacityReport(supabase, eventId)).sort((a, b) => b.utilizationPercent - a.utilizationPercent);

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", entityType: "daily_examination_event", entityId: eventId, newValue: { report: "capacity" } });
  }

  return (
    <div className="max-w-4xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} exportHref={`/api/admin/reports/${eventId}/capacity/export`} />
      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title="Room Capacity / Utilization Report" examDate={event.examDate} session={event.session} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No rooms allocated to this session.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800">
              <th className="px-2 py-2 font-semibold text-slate-700">Room</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Physical Positions</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Gaps</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Disabled</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Available Grid Seats</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Additional Seats</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Final Usable Capacity</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Seated</th>
              <th className="px-2 py-2 font-semibold text-slate-700">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.roomId} className="border-b border-slate-200">
                <td className="px-2 py-1.5 font-medium text-slate-900">{r.roomNumber}</td>
                <td className="px-2 py-1.5">{r.breakdown.physicalPositions}</td>
                <td className="px-2 py-1.5">{r.breakdown.gaps}</td>
                <td className="px-2 py-1.5">{r.breakdown.disabled}</td>
                <td className="px-2 py-1.5">{r.breakdown.availableGridSeats}</td>
                <td className="px-2 py-1.5">{r.breakdown.additionalSeats}</td>
                <td className="px-2 py-1.5 font-semibold">{r.breakdown.finalUsableCapacity}</td>
                <td className="px-2 py-1.5">{r.seatedCount}</td>
                <td className="px-2 py-1.5">{r.utilizationPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
