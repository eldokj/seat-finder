import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { groupByRoom, needsDraftWatermark } from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";
import { GroupedReportTable } from "@/components/admin/reports/ReportTable";

export default async function DateSessionReportPage(props: PageProps<"/admin/reports/[eventId]/date-session">) {
  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const rows = await loadEventSeatedRows(supabase, eventId);
  const groups = groupByRoom(rows);

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", entityType: "daily_examination_event", entityId: eventId, newValue: { report: "date_session" } });
  }

  return (
    <div className="max-w-4xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} exportHref={`/api/admin/reports/${eventId}/date-session/export`} />
      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title="Date/Session-wise Seating Report" examDate={event.examDate} session={event.session} />
      <GroupedReportTable groups={groups} groupLabel="Room" />
    </div>
  );
}
