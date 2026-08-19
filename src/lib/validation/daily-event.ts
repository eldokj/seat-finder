import { z } from "zod";

/**
 * Validates the raw FormData fields for creating/editing a Daily Exam
 * Session (table: `daily_examination_events` — the DB name is unchanged;
 * "Daily Exam Session" is the user-facing term). Field names match the
 * table's columns 1:1.
 *
 * Unlike the old per-course `exams` table, a session has no course/programme
 * fields at all — those live on its Master Timetable Records. A session is
 * a (date, session) slot with optional start/end times, belonging to
 * exactly one Examination Period.
 *
 * `status` is deliberately not part of this schema — a new session always
 * starts as 'draft'; publish/unpublish/close go through their own
 * dedicated, audited, confirmed actions.
 */
export const dailyEventInputSchema = z
  .object({
    examination_period_id: z.string().uuid("Select an examination period."),
    exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid exam date."),
    session: z.enum(["FN", "AN"], "Select a session (FN or AN)."),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Enter a valid start time.")
      .optional()
      .or(z.literal("")),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Enter a valid end time.")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => !data.start_time || !data.end_time || data.start_time < data.end_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  });

export type DailyEventInput = z.infer<typeof dailyEventInputSchema>;
