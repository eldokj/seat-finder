const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * The timezone "today" is evaluated in — for deciding which exam is
 * "today's exam" on both the admin dashboard and the student portal. Must
 * be a real IANA zone (not just UTC-offset arithmetic) so exam days line up
 * with the college's actual calendar regardless of where the server runs.
 * Configurable for future multi-campus/other-country use; defaults to
 * India since that's this deployment's context.
 */
export function getCollegeTimezone(): string {
  return process.env.NEXT_PUBLIC_COLLEGE_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

/** Today's date as YYYY-MM-DD in the college's configured timezone. */
export function getTodayDateString(timeZone: string = getCollegeTimezone()): string {
  // en-CA formats as YYYY-MM-DD, which doubles as a valid Postgres `date` literal.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Formats an ISO date (YYYY-MM-DD) as e.g. "18 August 2026". */
export function formatLongDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
