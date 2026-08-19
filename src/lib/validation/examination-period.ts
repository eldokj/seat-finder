import { z } from "zod";

/**
 * Validates the raw FormData fields for creating/editing an Examination
 * Period. Field names match the `examination_periods` table columns 1:1.
 *
 * The DB already enforces `end_date >= start_date` via a check constraint
 * (migration 0004) — this Zod refine duplicates that check purely to give a
 * friendlier, field-attributed error message before the request ever
 * reaches Postgres, matching the pattern already used for daily-event
 * start/end times.
 */
export const examinationPeriodInputSchema = z
  .object({
    name: z.string().trim().min(1, "Examination name is required.").max(200, "Examination name is too long."),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date."),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date."),
    status: z.enum(["active", "closed"]).default("active"),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "End date must be on or after the start date.",
    path: ["end_date"],
  });

export type ExaminationPeriodInput = z.infer<typeof examinationPeriodInputSchema>;
