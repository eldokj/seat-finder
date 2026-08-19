/**
 * College branding configuration.
 *
 * Phase 1: sourced from environment variables with safe placeholder
 * defaults, so the app is fully usable before the college provides real
 * branding. A future phase wires the admin "Settings" page to the
 * `settings` table in the database so staff can edit these without a
 * redeploy — this module is the single place that will change to read
 * from the database instead of `process.env` when that lands.
 *
 * Never hardcode the college name/logo anywhere else in the app — always
 * import `branding` from here.
 */
export interface Branding {
  collegeName: string;
  collegeLogoUrl: string | null;
  coeOfficeName: string;
  websiteTitle: string;
  contactEmail: string | null;
  contactPhone: string | null;
}

export const branding: Branding = {
  collegeName: process.env.NEXT_PUBLIC_COLLEGE_NAME?.trim() || "Your College Name",
  collegeLogoUrl: process.env.NEXT_PUBLIC_COLLEGE_LOGO_URL?.trim() || null,
  coeOfficeName:
    process.env.NEXT_PUBLIC_COE_OFFICE_NAME?.trim() || "Controller of Examinations",
  websiteTitle: process.env.NEXT_PUBLIC_WEBSITE_TITLE?.trim() || "Exam Seat Finder",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null,
  contactPhone: process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || null,
};
