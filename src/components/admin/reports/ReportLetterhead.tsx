import { branding } from "@/lib/config/branding";
import { formatLongDate } from "@/lib/utils/date";

interface ReportLetterheadProps {
  title: string;
  examDate?: string;
  session?: "FN" | "AN";
}

/** College letterhead — shown always (screen and print). Every report
 * carries this so a printed page is self-identifying even out of context. */
export function ReportLetterhead({ title, examDate, session }: ReportLetterheadProps) {
  return (
    <div className="mb-4 border-b-2 border-slate-900 pb-3 text-center">
      {branding.collegeLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo URL is admin-configured, arbitrary host
        <img src={branding.collegeLogoUrl} alt={`${branding.collegeName} logo`} className="mx-auto mb-2 h-12 w-auto object-contain" />
      ) : null}
      <p className="text-lg font-bold text-slate-900">{branding.collegeName}</p>
      <p className="text-sm text-slate-600">{branding.coeOfficeName}</p>
      <p className="mt-2 text-base font-semibold uppercase tracking-wide text-slate-800">{title}</p>
      {examDate && session && (
        <p className="text-sm text-slate-600">
          {formatLongDate(examDate)} — {session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
        </p>
      )}
    </div>
  );
}
