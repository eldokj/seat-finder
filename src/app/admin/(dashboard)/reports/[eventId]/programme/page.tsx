import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import { groupByProgramme, needsDraftWatermark, filterSeatedRowsByYearTerm, distinctYearsAndTerms } from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";
import { GroupedReportTable } from "@/components/admin/reports/ReportTable";
import { ReportYearTermFilter } from "@/components/admin/reports/ReportYearTermFilter";

export default async function ProgrammeWiseReportPage(props: PageProps<"/admin/reports/[eventId]/programme">) {
  const { eventId } = await props.params;
  const searchParams = await props.searchParams;
  const yearFilter = typeof searchParams.year === "string" && searchParams.year !== "" ? Number(searchParams.year) : undefined;
  const termFilter = typeof searchParams.term === "string" && searchParams.term !== "" ? Number(searchParams.term) : undefined;

  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const allRows = await loadEventSeatedRows(supabase, eventId);
  const { years, terms } = distinctYearsAndTerms(allRows);
  const groups = groupByProgramme(filterSeatedRowsByYearTerm(allRows, { year: yearFilter, term: termFilter }));

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, {
      adminId: session.user.id,
      action: "report_viewed",
      entityType: "daily_examination_event",
      entityId: eventId,
      newValue: { report: "programme", yearFilter, termFilter },
    });
  }

  const exportParams = new URLSearchParams();
  if (yearFilter !== undefined) exportParams.set("year", String(yearFilter));
  if (termFilter !== undefined) exportParams.set("term", String(termFilter));
  const exportQuery = exportParams.toString();

  return (
    <div className="max-w-4xl">
      <ReportToolbar
        backHref={`/admin/reports/${eventId}`}
        exportHref={`/api/admin/reports/${eventId}/programme/export${exportQuery ? `?${exportQuery}` : ""}`}
      />
      <ReportYearTermFilter
        action={`/admin/reports/${eventId}/programme`}
        years={years}
        terms={terms}
        selectedYear={yearFilter}
        selectedTerm={termFilter}
      />
      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title="Programme-wise Report" examDate={event.examDate} session={event.session} />
      <GroupedReportTable groups={groups} groupLabel="Programme" />
    </div>
  );
}
