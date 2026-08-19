import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { getStudentPortalUrl, generateQrCodeSvg } from "@/lib/admin/qr";
import { branding } from "@/lib/config/branding";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";

/**
 * A single static QR pointing at the student portal home page — never a
 * personalized/per-student code, never expires, print once and reuse for
 * every exam. No event/date data, so no draft/published concern applies.
 */
export default async function QrPosterPage() {
  const portalUrl = await getStudentPortalUrl();
  const qrSvg = await generateQrCodeSvg(portalUrl);

  const supabase = await createSupabaseServerClient();
  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", newValue: { report: "qr_poster" } });
  }

  return (
    <div className="max-w-md">
      <ReportToolbar backHref="/admin/reports" />
      <div className="rounded-2xl border-2 border-slate-900 p-10 text-center">
        {branding.collegeLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo URL is admin-configured, arbitrary host
          <img src={branding.collegeLogoUrl} alt={`${branding.collegeName} logo`} className="mx-auto mb-3 h-14 w-auto object-contain" />
        ) : null}
        <p className="text-lg font-bold text-slate-900">{branding.collegeName}</p>
        <p className="text-sm text-slate-600">{branding.coeOfficeName}</p>

        <div className="mx-auto my-8 h-56 w-56" dangerouslySetInnerHTML={{ __html: qrSvg }} />

        <p className="text-xl font-extrabold uppercase tracking-wide text-slate-900">Scan to Find Your Exam Seat</p>
        <p className="mt-2 font-mono text-xs text-slate-500">{portalUrl}</p>
      </div>
    </div>
  );
}
