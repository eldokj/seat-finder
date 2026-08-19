import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { sortSeatedRows, isNoticeBoardAllowed } from "@/lib/validation/reports";
import { getStudentPortalUrl, generateQrCodeSvg } from "@/lib/admin/qr";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";
import { ReportTable, type ReportColumn } from "@/components/admin/reports/ReportTable";

// Register No, Room, Seat only — never programme/course on the public copy.
const NOTICE_BOARD_COLUMNS: ReportColumn[] = [
  { key: "srNo", label: "Sr." },
  { key: "registerNo", label: "Register No" },
  { key: "roomNumber", label: "Room" },
  { key: "seatLabel", label: "Seat" },
];

export default async function NoticeBoardReportPage(props: PageProps<"/admin/reports/[eventId]/notice-board">) {
  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  // Hard, server-side gate — not just hidden in the UI. Never returns
  // seated-student data for a non-published event under any circumstance.
  if (!isNoticeBoardAllowed(event.status)) {
    return (
      <div className="max-w-2xl">
        <ReportToolbar backHref={`/admin/reports/${eventId}`} />
        <div className="rounded-xl border-2 border-dashed border-red-400 bg-red-50 p-8 text-center">
          <p className="text-lg font-bold text-red-700">Not available</p>
          <p className="mt-2 text-sm text-red-600">
            The Notice-Board Seating Copy is only available once this Daily Exam Session is published. Publish it from the session&apos;s
            detail page first.
          </p>
        </div>
      </div>
    );
  }

  const rows = sortSeatedRows(await loadEventSeatedRows(supabase, eventId), "registerNo");
  const portalUrl = await getStudentPortalUrl();
  const qrSvg = await generateQrCodeSvg(portalUrl);

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", entityType: "daily_examination_event", entityId: eventId, newValue: { report: "notice_board" } });
  }

  return (
    <div className="max-w-3xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} />
      <ReportLetterhead title="Examination Seating — Notice Board Copy" examDate={event.examDate} session={event.session} />

      <div className="mb-4 flex items-center justify-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="h-20 w-20 shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="text-sm text-slate-600">
          Scan to find your seat online: <br />
          <span className="font-mono text-xs">{portalUrl}</span>
        </p>
      </div>

      <ReportTable rows={rows} columns={NOTICE_BOARD_COLUMNS} />
    </div>
  );
}
