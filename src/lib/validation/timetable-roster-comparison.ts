/**
 * Part 8 of the spec: for each Master Timetable Record, compare its
 * planned Strength against the actual Student Roster count for that same
 * course. Pure function — the daily-event detail page supplies both sides
 * from live queries, this just does the comparison/labeling.
 */

export interface TimetableRosterComparisonInput {
  masterTimetableRecordId: string;
  programme: string;
  courseCode: string;
  courseName: string;
  timetableStrength: number;
  rosterCount: number;
}

export interface TimetableRosterComparisonRow extends TimetableRosterComparisonInput {
  difference: number; // rosterCount - timetableStrength
  status: "match" | "mismatch";
}

export function compareTimetableToRoster(
  inputs: TimetableRosterComparisonInput[]
): TimetableRosterComparisonRow[] {
  return inputs.map((input) => {
    const difference = input.rosterCount - input.timetableStrength;
    return { ...input, difference, status: difference === 0 ? "match" : "mismatch" };
  });
}

export function hasUnresolvedMismatches(rows: TimetableRosterComparisonRow[]): boolean {
  return rows.some((row) => row.status === "mismatch");
}
