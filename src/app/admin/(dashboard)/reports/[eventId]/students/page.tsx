import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadEventSeatedRows } from "@/lib/admin/reports-data-io";
import {
  sortSeatedRows,
  needsDraftWatermark,
  filterSeatedRowsByYearTerm,
  distinctYearsAndTerms,
  type ReportSortKey,
} from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import { ReportYearTermFilter } from "@/components/admin/reports/ReportYearTermFilter";

const SORT_OPTIONS: { value: ReportSortKey; label: string }[] = [
  { value: "registerNo", label: "Register No" },
  { value: "name", label: "Name" },
  { value: "room", label: "Room + Seat" },
];

export default async function StudentWiseReportPage(props: PageProps<"/admin/reports/[eventId]/students">) {
  const { eventId } = await props.params;
  const searchParams = await props.searchParams;
  const sortBy: ReportSortKey = SORT_OPTIONS.some((o) => o.value === searchParams.sort) ? (searchParams.sort as ReportSortKey) : "registerNo";
  const yearFilter = typeof searchParams.year === "string" && searchParams.year !== "" ? Number(searchParams.year) : undefined;
  const termFilter = typeof searchParams.term === "string" && searchParams.term !== "" ? Number(searchParams.term) : undefined;

  const supabase = await createSupabaseServerClient();
  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  const allRows = await loadEventSeatedRows(supabase, eventId);
  const { years, terms } = distinctYearsAndTerms(allRows);
  const rows = sortSeatedRows(filterSeatedRowsByYearTerm(allRows, { year: yearFilter, term: termFilter }), sortBy);

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, {
      adminId: session.user.id,
      action: "report_viewed",
      entityType: "daily_examination_event",
      entityId: eventId,
      newValue: { report: "students", sortBy, yearFilter, termFilter },
    });
  }

  const exportParams = new URLSearchParams({ sort: sortBy });
  if (yearFilter !== undefined) exportParams.set("year", String(yearFilter));
  if (termFilter !== undefined) exportParams.set("term", String(termFilter));

  return (
    <div className="max-w-4xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} exportHref={`/api/admin/reports/${eventId}/students/export?${exportParams.toString()}`} />

      <div className="mb-4 flex items-center gap-2 print:hidden">
        <span className="text-sm font-medium text-slate-600">Sort by:</span>
        {SORT_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/admin/reports/${eventId}/students?sort=${opt.value}`}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${sortBy === opt.value ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <ReportYearTermFilter
        action={`/admin/reports/${eventId}/students`}
        years={years}
        terms={terms}
        selectedYear={yearFilter}
        selectedTerm={termFilter}
        extraParams={{ sort: sortBy }}
      />

      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title="Student-wise Seating List" examDate={event.examDate} session={event.session} />
      <ReportTable rows={rows} />
    </div>
  );
}
