import { describe, it, expect } from "vitest";
import { compareTimetableToRoster, hasUnresolvedMismatches } from "./timetable-roster-comparison";

describe("compareTimetableToRoster", () => {
  it("reports MATCH when the roster count equals the timetable strength", () => {
    const [result] = compareTimetableToRoster([
      {
        masterTimetableRecordId: "tt-1",
        programme: "B.Sc CS",
        courseCode: "26PSY301",
        courseName: "Advanced Social Psychology",
        timetableStrength: 62,
        rosterCount: 62,
      },
    ]);
    expect(result.difference).toBe(0);
    expect(result.status).toBe("match");
  });

  it("reports MISMATCH with the correct (negative) difference when the roster is short, matching the spec's example", () => {
    const [result] = compareTimetableToRoster([
      {
        masterTimetableRecordId: "tt-1",
        programme: "B.Sc CS",
        courseCode: "26PSY301",
        courseName: "Advanced Social Psychology",
        timetableStrength: 62,
        rosterCount: 59,
      },
    ]);
    expect(result.difference).toBe(-3);
    expect(result.status).toBe("mismatch");
  });

  it("reports MISMATCH when the roster has MORE students than the timetable strength", () => {
    const [result] = compareTimetableToRoster([
      {
        masterTimetableRecordId: "tt-1",
        programme: "B.Com",
        courseCode: "26COM301",
        courseName: "Financial Accounting",
        timetableStrength: 74,
        rosterCount: 80,
      },
    ]);
    expect(result.difference).toBe(6);
    expect(result.status).toBe("mismatch");
  });
});

describe("hasUnresolvedMismatches", () => {
  it("is false when every record matches", () => {
    const rows = compareTimetableToRoster([
      { masterTimetableRecordId: "tt-1", programme: "B.Sc CS", courseCode: "26PSY301", courseName: "X", timetableStrength: 62, rosterCount: 62 },
    ]);
    expect(hasUnresolvedMismatches(rows)).toBe(false);
  });

  it("is true when at least one record mismatches", () => {
    const rows = compareTimetableToRoster([
      { masterTimetableRecordId: "tt-1", programme: "B.Sc CS", courseCode: "26PSY301", courseName: "X", timetableStrength: 62, rosterCount: 62 },
      { masterTimetableRecordId: "tt-2", programme: "B.Com", courseCode: "26COM301", courseName: "Y", timetableStrength: 74, rosterCount: 59 },
    ]);
    expect(hasUnresolvedMismatches(rows)).toBe(true);
  });
});
